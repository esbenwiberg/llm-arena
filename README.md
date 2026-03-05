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

**Can a cheap model match a frontier model by iterating more?**

LLM Arena runs the same coding task against multiple models with different iteration strategies, then compares the results. Each model gets agentic tools (file I/O, shell) and works in an isolated workspace.

## Setup

```bash
npm install --include=dev
npm run build
export ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

```bash
# Sonnet single-pass vs Haiku with retries
arena run -b blueprints/hello-api.md \
  -m anthropic:claude-sonnet-4-6-20250514@single-pass \
  -m anthropic:claude-haiku-4-5-20251001@retry

# All models x all strategies (cartesian)
arena run -b blueprints/hello-api.md \
  -m anthropic:claude-sonnet-4-6-20250514 \
  -m anthropic:claude-haiku-4-5-20251001 \
  -s single-pass,retry,self-critique \
  --max-rounds 5

# With Ollama local models
arena run -b blueprints/hello-api.md \
  -m ollama:qwen3-coder@retry \
  -m anthropic:claude-haiku-4-5-20251001@single-pass

# List backends
arena models

# View past results
arena results --run <run-id>
```

### Model spec format

```
backend:model[@strategy]
```

- `anthropic:claude-haiku-4-5-20251001` — uses global `-s` strategies
- `anthropic:claude-sonnet-4-6-20250514@single-pass` — override: only single-pass for this model
- `ollama:qwen3-coder@retry` — local model with retry strategy

## Strategies

| Strategy | Description |
|---|---|
| `single-pass` | One agentic conversation. Baseline — no feedback loop. |
| `retry` | Run tests after each round. Feed failures back. Repeat until pass or max rounds. |
| `self-critique` | Implement, then same model critiques in a fresh conversation. Fix and repeat. |
| `adversarial` | Like self-critique, but a different model critiques. Set with `--critic`. |

## Scorecard

After all runs complete, a comparison table is printed:

```
┌─────────────────┬────────────┬────────┬────────┬──────────┬──────────┐
│ Model           │ Strategy   │ Tests  │ Rounds │ Tokens   │ Time     │
├─────────────────┼────────────┼────────┼────────┼──────────┼──────────┤
│ anthropic:opus  │ single     │ PASS   │ 1      │ 12,400   │ 45s      │
│ anthropic:haiku │ single     │ FAIL   │ 1      │ 3,200    │ 12s      │
│ anthropic:haiku │ retry      │ PASS   │ 3      │ 14,800   │ 38s      │
│ anthropic:haiku │ self-crit  │ PASS   │ 2      │ 11,200   │ 31s      │
│ ollama:qwen3    │ retry      │ FAIL   │ 5      │ 42,000   │ 4m 12s   │
└─────────────────┴────────────┴────────┴────────┴──────────┴──────────┘
```

Results are also saved as JSON to `results/<run-id>.json`.

## Writing Blueprints

Blueprints are markdown files in `blueprints/` that define a coding task:

```markdown
# Blueprint: My Task

## System Prompt
You are a skilled developer.

## Task
Build a CLI that does X, Y, Z...

## Scaffold
path/to/starter-files

## Test Command
npm test

## Success Criteria
- All tests pass
- Handles edge cases
```

## Agent Tools

Each model gets these tools during its agentic loop:

| Tool | Description |
|---|---|
| `read_file` | Read file contents |
| `write_file` | Write/create a file |
| `list_files` | List files matching a glob |
| `run_command` | Execute a shell command |
| `done` | Signal task completion |

All file operations are sandboxed to the run's temporary workspace.

## Backends

- **Anthropic** — requires `ANTHROPIC_API_KEY` env var
- **Ollama** — requires Ollama running locally (default `http://localhost:11434`, override with `OLLAMA_HOST`)
