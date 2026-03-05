import type { LLMBackend } from './types.js';
import type { Message, ToolDef, ChatResponse, ContentBlock, ToolUseBlock, TextBlock } from '../types.js';

const OLLAMA_BASE = process.env.OLLAMA_HOST ?? 'http://localhost:11434';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export class OllamaBackend implements LLMBackend {
  private model: string;

  constructor(model: string) {
    this.model = model;
  }

  async chat(
    systemPrompt: string,
    messages: Message[],
    tools: ToolDef[],
    _maxTokens: number,
  ): Promise<ChatResponse> {
    const ollamaMessages: OllamaMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.convertMessages(messages),
    ];

    const ollamaTools: OllamaTool[] = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: ollamaMessages,
        tools: ollamaTools,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      message: { content?: string; tool_calls?: OllamaToolCall[] };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    const content: ContentBlock[] = [];

    if (data.message.content) {
      content.push({ type: 'text', text: data.message.content } satisfies TextBlock);
    }

    let stopReason: 'end_turn' | 'tool_use' = 'end_turn';

    if (data.message.tool_calls?.length) {
      stopReason = 'tool_use';
      for (const tc of data.message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: `ollama_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: tc.function.name,
          input: tc.function.arguments,
        } satisfies ToolUseBlock);
      }
    }

    return {
      content,
      stopReason,
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
    };
  }

  private convertMessages(messages: Message[]): OllamaMessage[] {
    const result: OllamaMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'assistant') {
        const textParts = msg.content
          .filter((b): b is TextBlock => b.type === 'text')
          .map((b) => b.text);
        const toolCalls = msg.content
          .filter((b): b is ToolUseBlock => b.type === 'tool_use')
          .map((b) => ({ function: { name: b.name, arguments: b.input } }));

        result.push({
          role: 'assistant',
          content: textParts.join('\n') || '',
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        });
      } else {
        // user messages may contain tool_results
        const toolResults = msg.content.filter(
          (b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result',
        );

        if (toolResults.length) {
          for (const tr of toolResults) {
            result.push({ role: 'tool', content: tr.content });
          }
        } else {
          const text = msg.content
            .filter((b): b is TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('\n');
          result.push({ role: 'user', content: text });
        }
      }
    }

    return result;
  }
}
