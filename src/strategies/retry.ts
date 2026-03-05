import type { Strategy, StrategyContext } from './types.js';
import type { RoundResult } from '../types.js';
import { runAgentLoop } from '../agent/loop.js';
import { runTests } from './util.js';

export const retry: Strategy = {
  name: 'retry',
  async *run(ctx: StrategyContext): AsyncGenerator<RoundResult> {
    const { config, backend, workspaceDir } = ctx;
    let previousTestOutput: string | undefined;

    for (let round = 1; round <= config.maxRounds; round++) {
      const systemPrompt = buildPrompt(
        config.blueprint.task,
        config.blueprint.systemPrompt,
        previousTestOutput,
        round,
      );

      console.log(`  [retry] Round ${round}/${config.maxRounds}...`);
      const agentResult = await runAgentLoop({
        backend,
        systemPrompt,
        workspaceDir,
        maxTokens: config.maxTokens,
      });

      const testResult = await runTests(workspaceDir, config.blueprint.testCommand);

      yield {
        round,
        phase: 'implement + test',
        tokensUsed: agentResult.tokensUsed,
        testOutput: testResult.output,
        testsPassed: testResult.passed,
      };

      if (testResult.passed) break;
      previousTestOutput = testResult.output;
    }
  },
};

function buildPrompt(
  task: string,
  systemPrompt: string | undefined,
  previousTestOutput: string | undefined,
  round: number,
): string {
  const parts = [];
  if (systemPrompt) parts.push(systemPrompt);
  parts.push(`## Task\n\n${task}`);

  if (previousTestOutput && round > 1) {
    parts.push(
      `## Previous Test Results (Round ${round - 1})\n\nThe tests FAILED. Here is the output:\n\n\`\`\`\n${previousTestOutput.slice(-3000)}\n\`\`\`\n\nFix the issues and make the tests pass.`,
    );
  }

  parts.push('Use the provided tools to implement/fix the code. When done, call the `done` tool.');
  return parts.join('\n\n');
}
