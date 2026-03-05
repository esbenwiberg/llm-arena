import type { Strategy, StrategyContext } from './types.js';
import type { RoundResult } from '../types.js';
import { runAgentLoop } from '../agent/loop.js';
import { runTests } from './util.js';

export const singlePass: Strategy = {
  name: 'single-pass',
  async *run(ctx: StrategyContext): AsyncGenerator<RoundResult> {
    const { config, backend, workspaceDir } = ctx;

    const systemPrompt = buildPrompt(config.blueprint.task, config.blueprint.systemPrompt);

    console.log('  [single-pass] Running agent...');
    const agentResult = await runAgentLoop({
      backend,
      systemPrompt,
      workspaceDir,
      maxTokens: config.maxTokens,
    });

    const testResult = await runTests(workspaceDir, config.blueprint.testCommand);

    yield {
      round: 1,
      phase: 'implement + test',
      tokensUsed: agentResult.tokensUsed,
      testOutput: testResult.output,
      testsPassed: testResult.passed,
    };
  },
};

function buildPrompt(task: string, systemPrompt?: string): string {
  const parts = [];
  if (systemPrompt) parts.push(systemPrompt);
  parts.push(`## Task\n\n${task}`);
  parts.push('Use the provided tools to implement the task. When done, call the `done` tool.');
  return parts.join('\n\n');
}
