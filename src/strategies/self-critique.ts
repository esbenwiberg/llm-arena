import type { Strategy, StrategyContext } from './types.js';
import type { RoundResult, Message, TextBlock } from '../types.js';
import { runAgentLoop } from '../agent/loop.js';
import { runTests } from './util.js';
import { getCodeSnapshot } from '../workspace/snapshot.js';

export const selfCritique: Strategy = {
  name: 'self-critique',
  async *run(ctx: StrategyContext): AsyncGenerator<RoundResult> {
    const { config, backend, workspaceDir } = ctx;
    let previousCritique: string | undefined;

    for (let round = 1; round <= config.maxRounds; round++) {
      // Phase 1: Implement
      const implPrompt = buildImplPrompt(
        config.blueprint.task,
        config.blueprint.systemPrompt,
        previousCritique,
        round,
      );

      console.log(`  [self-critique] Round ${round} - implementing...`);
      const implResult = await runAgentLoop({
        backend,
        systemPrompt: implPrompt,
        workspaceDir,
        maxTokens: config.maxTokens,
      });

      // Phase 2: Test
      const testResult = await runTests(workspaceDir, config.blueprint.testCommand);

      if (testResult.passed) {
        yield {
          round,
          phase: 'implement + test',
          tokensUsed: implResult.tokensUsed,
          testOutput: testResult.output,
          testsPassed: true,
        };
        break;
      }

      // Phase 3: Critique (same model, fresh conversation)
      console.log(`  [self-critique] Round ${round} - critiquing...`);
      const codeSnapshot = await getCodeSnapshot(workspaceDir);
      const critiquePrompt = buildCritiquePrompt(
        config.blueprint.task,
        codeSnapshot,
        testResult.output,
      );

      const critiqueMessages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Please review the code and provide your critique.' } satisfies TextBlock] },
      ];

      const critiqueResponse = await backend.chat(critiquePrompt, critiqueMessages, [], config.maxTokens);
      const critiqueText = critiqueResponse.content
        .filter((b): b is TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');

      previousCritique = critiqueText;

      yield {
        round,
        phase: 'implement + critique',
        tokensUsed: {
          input: implResult.tokensUsed.input + critiqueResponse.usage.inputTokens,
          output: implResult.tokensUsed.output + critiqueResponse.usage.outputTokens,
        },
        testOutput: testResult.output,
        testsPassed: false,
        critique: critiqueText,
      };
    }
  },
};

function buildImplPrompt(
  task: string,
  systemPrompt: string | undefined,
  critique: string | undefined,
  round: number,
): string {
  const parts = [];
  if (systemPrompt) parts.push(systemPrompt);
  parts.push(`## Task\n\n${task}`);

  if (critique && round > 1) {
    parts.push(
      `## Critique from Previous Round\n\nA reviewer found the following issues:\n\n${critique}\n\nFix all issues raised in the critique.`,
    );
  }

  parts.push('Use the provided tools to implement/fix the code. When done, call the `done` tool.');
  return parts.join('\n\n');
}

function buildCritiquePrompt(task: string, code: string, testOutput: string): string {
  return `You are a code reviewer. The following code was written to solve a task but the tests are failing.

## Task
${task}

## Current Code
${code}

## Test Output
\`\`\`
${testOutput.slice(-3000)}
\`\`\`

Identify specific issues, bugs, and missing functionality. Be concise and actionable. List the problems and suggest fixes.`;
}

