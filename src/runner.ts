import { nanoid } from 'nanoid';
import type { RunConfig, RunResult, ModelSpec } from './types.js';
import type { LLMBackend } from './backends/types.js';
import type { Strategy } from './strategies/types.js';
import { AnthropicBackend } from './backends/anthropic.js';
import { OllamaBackend } from './backends/ollama.js';
import { singlePass } from './strategies/single-pass.js';
import { retry } from './strategies/retry.js';
import { selfCritique } from './strategies/self-critique.js';
import { adversarial } from './strategies/adversarial.js';
import { createWorkspace } from './workspace/setup.js';
import { cleanupWorkspace } from './workspace/cleanup.js';
import { parseTestSummary } from './strategies/util.js';

const STRATEGIES: Record<string, Strategy> = {
  'single-pass': singlePass,
  retry,
  'self-critique': selfCritique,
  adversarial,
};

export function createBackend(spec: ModelSpec): LLMBackend {
  switch (spec.backend) {
    case 'anthropic':
      return new AnthropicBackend(spec.model);
    case 'ollama':
      return new OllamaBackend(spec.model);
    default:
      throw new Error(`Unknown backend: ${spec.backend}`);
  }
}

export async function executeRun(config: RunConfig): Promise<RunResult> {
  const strategy = STRATEGIES[config.strategy];
  if (!strategy) throw new Error(`Unknown strategy: ${config.strategy}`);

  const backend = createBackend(config.model);
  const criticBackend = config.critic ? createBackend(config.critic) : undefined;

  const workspaceDir = await createWorkspace(config.blueprint, config.blueprintPath);
  const startTime = Date.now();

  const rounds = [];
  const totalTokens = { input: 0, output: 0 };
  let testsPassed = false;
  let lastTestOutput = '';

  try {
    for await (const round of strategy.run({
      config,
      backend,
      criticBackend,
      workspaceDir,
    })) {
      rounds.push(round);
      totalTokens.input += round.tokensUsed.input;
      totalTokens.output += round.tokensUsed.output;

      if (round.testOutput) lastTestOutput = round.testOutput;
      if (round.testsPassed) {
        testsPassed = true;
      }
    }
  } finally {
    await cleanupWorkspace(workspaceDir);
  }

  return {
    id: nanoid(10),
    model: config.model,
    strategy: config.strategy,
    blueprint: config.blueprint.name,
    rounds,
    totalTokens,
    testsPassed,
    testSummary: parseTestSummary(lastTestOutput),
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}
