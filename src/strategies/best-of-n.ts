import { cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Strategy, StrategyContext } from './types.js';
import type { RoundResult } from '../types.js';
import { runAgentLoop } from '../agent/loop.js';
import { runTests } from './util.js';

export const bestOfN: Strategy = {
  name: 'best-of-n',
  async *run(ctx: StrategyContext): AsyncGenerator<RoundResult> {
    const { config, backend, workspaceDir } = ctx;
    const n = config.maxRounds;

    const systemPrompt = buildPrompt(config.blueprint.task, config.blueprint.systemPrompt);

    // Create N independent workspace copies
    const workspaces: string[] = [];
    for (let i = 0; i < n; i++) {
      const ws = await mkdtemp(join(tmpdir(), 'arena-bon-'));
      await cp(workspaceDir, ws, { recursive: true });
      workspaces.push(ws);
    }

    console.log(`  [best-of-n] Running ${n} attempts in parallel...`);

    // Run all N attempts in parallel
    const attempts = workspaces.map((ws, i) =>
      runAttempt(backend, systemPrompt, ws, config.maxTokens, config.blueprint.testCommand, i + 1),
    );

    const results = await Promise.all(attempts);

    // Yield results in order
    let bestIdx = -1;
    let bestScore = -1;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      yield r;

      // Score: passed > fewer tokens
      const score = r.testsPassed ? 1_000_000_000 - (r.tokensUsed.input + r.tokensUsed.output) : 0;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    // Copy the best workspace back to the main workspace
    if (bestIdx >= 0) {
      console.log(`  [best-of-n] Best attempt: #${bestIdx + 1} (${results[bestIdx].testsPassed ? 'PASSED' : 'FAILED'})`);
      await cp(workspaces[bestIdx], workspaceDir, { recursive: true });
    }

    // Cleanup temp workspaces
    for (const ws of workspaces) {
      await rm(ws, { recursive: true, force: true }).catch(() => {});
    }
  },
};

async function runAttempt(
  backend: Parameters<typeof runAgentLoop>[0]['backend'],
  systemPrompt: string,
  workspaceDir: string,
  maxTokens: number,
  testCommand: string,
  attemptNum: number,
): Promise<RoundResult> {
  console.log(`  [best-of-n] Attempt #${attemptNum} starting...`);

  const agentResult = await runAgentLoop({
    backend,
    systemPrompt,
    workspaceDir,
    maxTokens,
  });

  const testResult = await runTests(workspaceDir, testCommand);
  console.log(`  [best-of-n] Attempt #${attemptNum}: ${testResult.passed ? 'PASSED' : 'FAILED'}`);

  return {
    round: attemptNum,
    phase: `attempt #${attemptNum}`,
    tokensUsed: agentResult.tokensUsed,
    testOutput: testResult.output,
    testsPassed: testResult.passed,
  };
}

function buildPrompt(task: string, systemPrompt?: string): string {
  const parts = [];
  if (systemPrompt) parts.push(systemPrompt);
  parts.push(`## Task\n\n${task}`);
  parts.push('Use the provided tools to implement the task. When done, call the `done` tool.');
  return parts.join('\n\n');
}
