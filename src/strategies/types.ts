import type { RunConfig, RoundResult } from '../types.js';
import type { LLMBackend } from '../backends/types.js';

export interface StrategyContext {
  config: RunConfig;
  backend: LLMBackend;
  criticBackend?: LLMBackend;
  workspaceDir: string;
}

export interface Strategy {
  name: string;
  run(ctx: StrategyContext): AsyncGenerator<RoundResult>;
}
