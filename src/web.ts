import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { parseBlueprint } from './blueprint.js';
import { executeRun } from './runner.js';
import type { RunConfig, Blueprint, ModelSpec, StrategyName, RoundResult, RunResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WEB_DIR = resolve(__dirname, '..', 'web');

const app = express();
app.use(express.json());
app.use(express.static(WEB_DIR));

app.get('/api/blueprints', async (_req, res) => {
  try {
    const dir = resolve('blueprints');
    const files = await readdir(dir);
    const blueprints = [];
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      try {
        const bp = await parseBlueprint(join(dir, file));
        blueprints.push({ file, name: bp.name, task: bp.task.slice(0, 300) });
      } catch {
        /* skip invalid */
      }
    }
    res.json(blueprints);
  } catch {
    res.json([]);
  }
});

app.post('/api/fight', async (req, res) => {
  const { fighters, blueprintFile, customTask, maxRounds = 5, maxTokens = 4096 } = req.body;

  if (!fighters || fighters.length < 2) {
    res.status(400).json({ error: 'Need at least 2 fighters' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let blueprint: Blueprint;
  let blueprintPath: string;

  if (blueprintFile) {
    blueprintPath = resolve('blueprints', blueprintFile);
    try {
      blueprint = await parseBlueprint(blueprintPath);
    } catch (err) {
      send('error', { message: `Failed to load blueprint: ${(err as Error).message}` });
      res.end();
      return;
    }
  } else if (customTask) {
    blueprint = {
      name: customTask.name || 'Custom Arena Task',
      task: customTask.task,
      testCommand: customTask.testCommand || 'echo "No tests configured"',
      successCriteria: ['Task completed successfully'],
    };
    blueprintPath = resolve('blueprints');
  } else {
    send('error', { message: 'No blueprint or custom task provided' });
    res.end();
    return;
  }

  send('fight-start', {
    fighters,
    blueprint: blueprint.name,
    maxRounds,
  });

  const results: RunResult[] = [];

  for (let i = 0; i < fighters.length; i++) {
    const fighter = fighters[i];
    const config: RunConfig = {
      blueprint,
      blueprintPath,
      model: { backend: fighter.backend, model: fighter.model } as ModelSpec,
      strategy: (fighter.strategy || 'single-pass') as StrategyName,
      maxRounds,
      maxTokens,
    };

    send('fighter-enter', { index: i, fighter });

    try {
      const result = await executeRun(config, (round: RoundResult) => {
        send('round', { index: i, round });
      });
      results.push(result);
      send('fighter-done', { index: i, result });
    } catch (err) {
      const errorMsg = (err as Error).message;
      send('fighter-error', { index: i, error: errorMsg });
      results.push({
        id: 'error',
        model: config.model,
        strategy: config.strategy,
        blueprint: blueprint.name,
        rounds: [],
        totalTokens: { input: 0, output: 0 },
        testsPassed: false,
        testSummary: 'Error: ' + errorMsg,
        duration: 0,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Opus judges the code
  send('judging', { message: 'OPUS is judging the code...' });
  let verdict: JudgeVerdict;
  try {
    verdict = await judgeWithOpus(fighters, results);
    send('judge-verdict', verdict);
  } catch (err) {
    console.error('  [judge] Error:', (err as Error).message);
    verdict = fallbackJudge(results);
  }

  send('fight-over', { results, winner: verdict.winner, commentary: verdict.commentary, scores: verdict.scores });
  res.end();
});

interface JudgeVerdict {
  winner: { index: number; reason: string } | null;
  scores: [number, number];
  commentary: string;
}

async function judgeWithOpus(
  fighters: Array<{ backend: string; model: string; strategy: string }>,
  results: RunResult[],
): Promise<JudgeVerdict> {
  const client = new Anthropic();

  const fighterSections = results.map((r, i) => {
    const f = fighters[i];
    const tokens = r.totalTokens.input + r.totalTokens.output;
    return `## Fighter ${i + 1}: ${f.model} (${f.strategy})
- Tests: ${r.testsPassed ? 'PASSED' : 'FAILED'}
- Rounds: ${r.rounds.length}
- Tokens: ${tokens.toLocaleString()}
- Time: ${r.duration}ms
- Test summary: ${r.testSummary || 'N/A'}

### Code
${(r.codeSnapshot || 'No code produced').slice(0, 15000)}`;
  }).join('\n\n---\n\n');

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 512,
    system: `You are the head judge of LLM ARENA, a Street Fighter-style coding tournament. You review the code produced by two AI fighters and score them.

Score each fighter 0-10 on:
- Correctness (did tests pass? does the code work?)
- Code quality (clean, readable, well-structured?)
- Efficiency (reasonable approach, not over-engineered?)

Then pick a winner (or declare a draw) and give a brief, hype Street Fighter announcer-style commentary (2-3 sentences).

RESPOND IN EXACTLY THIS JSON FORMAT:
{"score1": <number>, "score2": <number>, "winner": <1 or 2 or 0 for draw>, "reason": "<short reason>", "commentary": "<announcer commentary>"}`,
    messages: [{
      role: 'user',
      content: fighterSections,
    }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  const text = textBlock?.text || '';

  // Parse JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('  [judge] Could not parse verdict, falling back');
    return fallbackJudge(results);
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const winnerIndex = parsed.winner === 0 ? null : parsed.winner - 1;

  return {
    winner: winnerIndex !== null ? { index: winnerIndex, reason: parsed.reason } : null,
    scores: [parsed.score1, parsed.score2],
    commentary: parsed.commentary,
  };
}

function fallbackJudge(results: RunResult[]): JudgeVerdict {
  if (results.length < 2) return { winner: null, scores: [0, 0], commentary: '' };
  const [a, b] = results;

  if (!a.testsPassed && !b.testsPassed) return { winner: null, scores: [0, 0], commentary: 'Both fighters fell.' };
  if (a.testsPassed && !b.testsPassed) return { winner: { index: 0, reason: 'Tests passed' }, scores: [7, 0], commentary: '' };
  if (!a.testsPassed && b.testsPassed) return { winner: { index: 1, reason: 'Tests passed' }, scores: [0, 7], commentary: '' };

  const tokensA = a.totalTokens.input + a.totalTokens.output;
  const tokensB = b.totalTokens.input + b.totalTokens.output;
  if (tokensA < tokensB) return { winner: { index: 0, reason: 'More efficient' }, scores: [7, 5], commentary: '' };
  if (tokensB < tokensA) return { winner: { index: 1, reason: 'More efficient' }, scores: [5, 7], commentary: '' };

  return { winner: null, scores: [5, 5], commentary: 'A perfect tie.' };
}

const PORT = parseInt(process.env.PORT || '8888');
app.listen(PORT, () => {
  console.log('');
  console.log('  ==========================================');
  console.log('    LLM ARENA - Street Fighter Edition');
  console.log('  ==========================================');
  console.log(`  http://localhost:${PORT}`);
  console.log('');
});
