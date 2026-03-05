import type { Message, ToolDef, ChatResponse } from '../types.js';

export interface LLMBackend {
  chat(
    systemPrompt: string,
    messages: Message[],
    tools: ToolDef[],
    maxTokens: number,
  ): Promise<ChatResponse>;
}
