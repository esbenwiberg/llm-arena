import Table from 'cli-table3';
import chalk from 'chalk';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunResult } from './types.js';

export function renderScorecard(results: RunResult[]): void {
  const table = new Table({
    head: [
      chalk.bold('Model'),
      chalk.bold('Strategy'),
      chalk.bold('Tests'),
      chalk.bold('Rounds'),
      chalk.bold('Tokens'),
      chalk.bold('Time'),
    ],
    style: { head: [], border: [] },
  });

  for (const r of results) {
    const totalTokens = r.totalTokens.input + r.totalTokens.output;
    table.push([
      `${r.model.backend}:${r.model.model}`,
      r.strategy,
      r.testsPassed ? chalk.green(`PASS`) : chalk.red(`FAIL`),
      `${r.rounds.length}`,
      totalTokens.toLocaleString(),
      formatDuration(r.duration),
    ]);
  }

  console.log();
  console.log(table.toString());
  console.log();
}

export async function saveResults(results: RunResult[], runDir: string): Promise<string> {
  await mkdir(runDir, { recursive: true });
  const id = results[0]?.id ?? 'unknown';
  const filePath = join(runDir, `${id}.json`);
  await writeFile(filePath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`Results saved to ${filePath}`);
  return filePath;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
