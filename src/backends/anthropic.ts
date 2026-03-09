import Anthropic from '@anthropic-ai/sdk';
import type { LLMBackend } from './types.js';
import type { Message, ToolDef, ChatResponse, ContentBlock } from '../types.js';

export class AnthropicBackend implements LLMBackend {
  private client: Anthropic;
  private model: string;

  constructor(model: string) {
    const apiKey = process.env.LLM_ARENA_ANTHROPIC_KEY ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'No Anthropic API key found. Set LLM_ARENA_ANTHROPIC_KEY (preferred) or ANTHROPIC_API_KEY.',
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(
    systemPrompt: string,
    messages: Message[],
    tools: ToolDef[],
    maxTokens: number,
  ): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content as Anthropic.MessageParam['content'],
      })),
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool['input_schema'],
      })),
    });

    return {
      content: response.content as ContentBlock[],
      stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
