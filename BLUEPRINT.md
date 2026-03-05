```
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║     ██╗     ██╗     ███╗   ███╗                               ║
    ║     ██║     ██║     ████╗ ████║                               ║
    ║     ██║     ██║     ██╔████╔██║                               ║
    ║     ██║     ██║     ██║╚██╔╝██║                               ║
    ║     ███████╗███████╗██║ ╚═╝ ██║                               ║
    ║     ╚══════╝╚══════╝╚═╝     ╚═╝                               ║
    ║                                                               ║
    ║      █████╗ ██████╗ ███████╗███╗   ██╗ █████╗                 ║
    ║     ██╔══██╗██╔══██╗██╔════╝████╗  ██║██╔══██╗                ║
    ║     ███████║██████╔╝█████╗  ██╔██╗ ██║███████║                ║
    ║     ██╔══██║██╔══██╗██╔══╝  ██║╚██╗██║██╔══██║                ║
    ║     ██║  ██║██║  ██║███████╗██║ ╚████║██║  ██║                ║
    ║     ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝                ║
    ║                                                               ║
    ║          ⚔️  M O D E L   V S   M O D E L  ⚔️                 ║
    ║                                                               ║
    ║     ┌─────────┐                         ┌─────────┐           ║
    ║     │ CLAUDE  │  ░▒▓█ FIGHT! █▓▒░      │ OLLAMA  │           ║
    ║     │  ╭━━╮   │         ⚡               │  ╭━━╮   │           ║
    ║     │  ┃°°┃   │◄═══════════════════════►│  ┃^^┃   │           ║
    ║     │  ╰┳┳╯   │    ROUND 1 ... N        │  ╰┳┳╯   │           ║
    ║     │  ╱╰╰╲   │                         │  ╱╰╰╲   │           ║
    ║     └─────────┘                         └─────────┘           ║
    ║                                                               ║
    ║        "Iterate until you win — or the tokens run out"        ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
```

# LLM Arena — Model Comparison Harness

## Context

Test the thesis: can a local/cheaper model match a frontier model by iterating more? The harness runs the same development blueprint against multiple models with configurable iteration strategies, then compares results.

## Project

- **Location**: `~/repos/orcha-clones/llm-arena/`
- **Stack**: Node.js 22, TypeScript (ESM, tsup), CLI via commander
- **Backends**: Anthropic SDK + Ollama native REST API
- **Interaction**: Agentic (models get file/shell tools)

## Blueprint Format

```markdown
# Blueprint: <name>

## System Prompt
<optional system prompt for the agent>

## Task
<what to build — the spec>

## Scaffold
<git repo URL or inline file structure to start from>

## Test Command
```bash
npm test
```

## Success Criteria
- All tests pass
- <optional extra criteria>
```

Blueprints live in `blueprints/` directory as `.md` files.

## CLI Interface

```bash
# Run a single model on a blueprint
arena run --blueprint blueprints/rest-api.md --model anthropic:haiku --strategy retry

# Compare two models
arena run --blueprint blueprints/rest-api.md \
  --model anthropic:opus \
  --model anthropic:haiku \
  --strategy retry,self-critique \
  --max-rounds 5

# List available models
arena models

# View results
arena results --run <run-id>
```

Key flags:
- `--model <backend:model>` — repeatable. e.g. `anthropic:claude-haiku-4-5-20251001`, `ollama:qwen3-coder`
- `--strategy <name,...>` — multi-select, comma-separated. Runs each model x strategy combination
- `--max-rounds` — max iteration rounds per strategy (default 5)
- `--max-tokens` — token budget per round (default 4096)
- `--parallel` — run combinations in parallel (default: sequential)

## 4 Iteration Strategies

### 1. `single-pass`
One agentic conversation. Model gets tools, works until it says "done". No external feedback loop. This is the baseline.

### 2. `retry`
Multiple rounds. Each round: fresh agentic conversation with spec + current code state + test results from previous round. Stops when tests pass or max rounds hit.

```
Round 1: system=spec → agent works → run tests → FAIL
Round 2: system=spec + "tests failed: <output>" → agent works → run tests → PASS ✓
```

### 3. `self-critique`
Two-phase rounds. Phase 1: agent implements. Phase 2: same model critiques the code (separate conversation). Phase 3: agent fixes based on critique. Repeat.

```
Round 1a: agent implements
Round 1b: critic reviews (same model, fresh convo): "issues: X, Y, Z"
Round 2a: agent fixes based on critique
Round 2b: run tests → PASS ✓
```

### 4. `adversarial`
Like self-critique, but the critic is a DIFFERENT model instance (can be a different model entirely). Configurable via `--critic <backend:model>`.

```
Round 1a: model-A implements
Round 1b: model-B critiques
Round 2a: model-A fixes
Round 2b: run tests → PASS ✓
```

## Agent Tools

The agentic loop gives models these tools:

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents at path |
| `write_file` | Write/create file at path |
| `list_files` | List files matching glob pattern |
| `run_command` | Execute shell command, return stdout+stderr+exit_code |
| `done` | Signal completion — exits the agent loop |

## Architecture / File Structure

```
llm-arena/
  package.json
  tsconfig.json
  tsup.config.ts
  blueprints/              # example blueprints
    hello-api.md
  src/
    cli.ts                 # commander CLI entrypoint
    types.ts               # shared types (Blueprint, RunConfig, RunResult, etc.)
    blueprint.ts           # parse blueprint markdown
    runner.ts              # orchestrates: model x strategy → isolated run
    scorecard.ts           # compare results, render table
    backends/
      types.ts             # LLMBackend interface
      anthropic.ts         # Anthropic SDK backend
      ollama.ts            # Ollama REST API backend
    agent/
      loop.ts              # core agentic tool-use loop (backend-agnostic)
      tools.ts             # tool definitions + executors (read_file, write_file, etc.)
    strategies/
      types.ts             # Strategy interface
      single-pass.ts       # one agentic conversation
      retry.ts             # test-feedback loop
      self-critique.ts     # implement → critique → fix loop
      adversarial.ts       # implement → external critique → fix loop
    workspace/
      setup.ts             # create temp dirs, scaffold from blueprint
      cleanup.ts           # remove temp dirs
  dist/                    # tsup output
```

## Backend Interface

```typescript
// Unified message format (Anthropic-style, Ollama adapter translates)
interface Message {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  // ... fields per type
}

interface LLMBackend {
  chat(messages: Message[], tools: ToolDef[]): Promise<{
    content: ContentBlock[];
    stopReason: 'end_turn' | 'tool_use';
    usage: { inputTokens: number; outputTokens: number };
  }>;
}
```

Anthropic backend: direct SDK call.
Ollama backend: POST `/api/chat` with tool definitions, translate response format.

## Scorecard Output

After all runs complete, print a comparison table:

```
┌─────────────────┬────────────┬────────────┬────────────┬──────────┬───────────┐
│ Model           │ Strategy   │ Tests Pass │ Rounds     │ Tokens   │ Time      │
├─────────────────┼────────────┼────────────┼────────────┼──────────┼───────────┤
│ anthropic:opus  │ single     │ 8/8 ✓     │ 1          │ 12,400   │ 45s       │
│ anthropic:haiku │ single     │ 5/8 ✗     │ 1          │ 3,200    │ 12s       │
│ anthropic:haiku │ retry      │ 8/8 ✓     │ 3          │ 14,800   │ 38s       │
│ anthropic:haiku │ self-crit  │ 8/8 ✓     │ 2          │ 11,200   │ 31s       │
│ ollama:qwen3    │ retry      │ 7/8 ✗     │ 5          │ 42,000   │ 4m 12s   │
└─────────────────┴────────────┴────────────┴────────────┴──────────┴───────────┘
```

Also saves full results as JSON to `results/<run-id>.json`.

## Implementation Order

1. **Scaffold project** — package.json, tsconfig, tsup, bin entrypoint
2. **Types + blueprint parser** — types.ts, blueprint.ts
3. **Agent tools** — tool definitions and executors (sandboxed to workspace dir)
4. **Agent loop** — core tool-use conversation loop (backend-agnostic)
5. **Anthropic backend** — using @anthropic-ai/sdk
6. **Ollama backend** — using fetch to /api/chat
7. **Strategies** — single-pass, retry, self-critique, adversarial
8. **Runner + workspace** — orchestrate runs in isolated temp dirs
9. **Scorecard** — results comparison + CLI output
10. **CLI** — commander wiring
11. **Example blueprint** — a simple REST API task with tests

## Verification

```bash
cd ~/repos/orcha-clones/llm-arena
npm run build

# Test with Anthropic (haiku is cheapest)
arena run --blueprint blueprints/hello-api.md \
  --model anthropic:claude-haiku-4-5-20251001 \
  --strategy single-pass,retry

# Test with Ollama (must be running locally)
arena run --blueprint blueprints/hello-api.md \
  --model ollama:qwen3-coder \
  --strategy retry

# Compare
arena run --blueprint blueprints/hello-api.md \
  --model anthropic:claude-haiku-4-5-20251001 \
  --model anthropic:claude-sonnet-4-6 \
  --strategy single-pass,retry,self-critique \
  --max-rounds 5
```
