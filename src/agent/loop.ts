import type { Message, ContentBlock, ToolUseBlock, ToolResultBlock, ChatResponse } from '../types.js';
import type { LLMBackend } from '../backends/types.js';
import { TOOL_DEFS, executeTool } from './tools.js';

export interface AgentLoopOptions {
  backend: LLMBackend;
  systemPrompt: string;
  workspaceDir: string;
  maxTokens: number;
  maxTurns?: number;
}

export interface AgentLoopResult {
  messages: Message[];
  tokensUsed: { input: number; output: number };
  doneSummary?: string;
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const { backend, systemPrompt, workspaceDir, maxTokens, maxTurns = 50 } = options;

  const messages: Message[] = [
    { role: 'user', content: 'Begin the task. Use the provided tools to implement the solution.' },
  ];
  const tokensUsed = { input: 0, output: 0 };
  let doneSummary: string | undefined;

  for (let turn = 0; turn < maxTurns; turn++) {
    let response: ChatResponse;
    try {
      response = await backend.chat(systemPrompt, messages, TOOL_DEFS, maxTokens);
    } catch (err) {
      console.error(`  [agent] Backend error on turn ${turn + 1}:`, (err as Error).message);
      break;
    }

    tokensUsed.input += response.usage.inputTokens;
    tokensUsed.output += response.usage.outputTokens;

    messages.push({ role: 'assistant', content: response.content });

    if (response.stopReason !== 'tool_use') {
      break;
    }

    const toolUses = response.content.filter(
      (b): b is ToolUseBlock => b.type === 'tool_use',
    );

    const toolResults: ToolResultBlock[] = [];
    let shouldBreak = false;

    for (const toolUse of toolUses) {
      console.log(`  [agent] tool: ${toolUse.name}`, toolUse.name === 'done' ? '' : JSON.stringify(toolUse.input).slice(0, 120));
      try {
        const { result, done } = await executeTool(toolUse.name, toolUse.input, workspaceDir);
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result });
        if (done) {
          doneSummary = result;
          shouldBreak = true;
        }
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Error: ${(err as Error).message}`,
          is_error: true,
        });
      }
    }

    messages.push({ role: 'user', content: toolResults as ContentBlock[] });

    if (shouldBreak) break;
  }

  return { messages, tokensUsed, doneSummary };
}
