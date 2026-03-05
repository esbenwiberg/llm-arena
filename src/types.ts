export interface Blueprint {
  name: string;
  systemPrompt?: string;
  task: string;
  scaffold?: string;
  testCommand: string;
  successCriteria: string[];
}

export interface RunConfig {
  blueprint: Blueprint;
  blueprintPath: string;
  model: ModelSpec;
  strategy: StrategyName;
  maxRounds: number;
  maxTokens: number;
  critic?: ModelSpec;
}

export interface ModelSpec {
  backend: 'anthropic' | 'ollama';
  model: string;
}

export type StrategyName = 'single-pass' | 'retry' | 'self-critique' | 'adversarial';

export interface RoundResult {
  round: number;
  phase: string;
  tokensUsed: { input: number; output: number };
  testOutput?: string;
  testsPassed?: boolean;
  critique?: string;
}

export interface RunResult {
  id: string;
  model: ModelSpec;
  strategy: StrategyName;
  blueprint: string;
  rounds: RoundResult[];
  totalTokens: { input: number; output: number };
  testsPassed: boolean;
  testSummary: string;
  duration: number;
  timestamp: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ChatResponse {
  content: ContentBlock[];
  stopReason: 'end_turn' | 'tool_use';
  usage: { inputTokens: number; outputTokens: number };
}
