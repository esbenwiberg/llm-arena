import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface TestResult {
  passed: boolean;
  output: string;
  exitCode: number;
}

export async function runTests(workspaceDir: string, testCommand: string): Promise<TestResult> {
  console.log(`  [test] Running: ${testCommand}`);
  try {
    const { stdout, stderr } = await execFileAsync('bash', ['-c', testCommand], {
      cwd: workspaceDir,
      timeout: 120_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, NODE_ENV: 'test' },
    });
    const output = [stdout, stderr].filter(Boolean).join('\n');
    console.log('  [test] PASSED');
    return { passed: true, output, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    const output = [e.stdout, e.stderr].filter(Boolean).join('\n') || e.message || 'Unknown error';
    console.log(`  [test] FAILED (exit ${e.code ?? 1})`);
    return { passed: false, output, exitCode: e.code ?? 1 };
  }
}

export function parseTestSummary(output: string): string {
  // Try to extract a summary line like "8 passing" or "Tests: 5 passed, 3 failed"
  const lines = output.split('\n');
  for (const line of lines.reverse()) {
    if (/pass|fail|error|test/i.test(line) && line.trim().length < 120) {
      return line.trim();
    }
  }
  return output.slice(-200).trim();
}
