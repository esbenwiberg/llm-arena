import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve, relative, join } from 'node:path';
import { minimatch } from 'minimatch';
import type { ToolDef } from '../types.js';

const execFileAsync = promisify(execFile);

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'read_file',
    description: 'Read file contents at a given path (relative to workspace root)',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to workspace root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write or create a file at a given path (relative to workspace root)',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to workspace root' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_files',
    description: 'List files matching a glob pattern in the workspace',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g. "**/*.ts")' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'run_command',
    description: 'Execute a shell command in the workspace directory. Returns stdout, stderr, and exit code.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
      },
      required: ['command'],
    },
  },
  {
    name: 'done',
    description: 'Signal that you have completed the task. Call this when you are finished.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary of what was done' },
      },
      required: ['summary'],
    },
  },
];

function safePath(workspaceDir: string, filePath: string): string {
  const resolved = resolve(workspaceDir, filePath);
  const rel = relative(workspaceDir, resolved);
  if (rel.startsWith('..') || resolve(resolved) !== resolve(workspaceDir, rel)) {
    throw new Error(`Path escapes workspace: ${filePath}`);
  }
  return resolved;
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  workspaceDir: string,
): Promise<{ result: string; done: boolean }> {
  switch (name) {
    case 'read_file': {
      const fullPath = safePath(workspaceDir, input.path as string);
      const content = await readFile(fullPath, 'utf-8');
      return { result: content, done: false };
    }

    case 'write_file': {
      const fullPath = safePath(workspaceDir, input.path as string);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, input.content as string, 'utf-8');
      return { result: `Written: ${input.path}`, done: false };
    }

    case 'list_files': {
      const pattern = input.pattern as string;
      const matches = await walkAndMatch(workspaceDir, pattern);
      return { result: matches.sort().join('\n') || '(no files found)', done: false };
    }

    case 'run_command': {
      const command = input.command as string;
      try {
        const { stdout, stderr } = await execFileAsync('bash', ['-c', command], {
          cwd: workspaceDir,
          timeout: 60_000,
          maxBuffer: 1024 * 1024,
          env: { ...process.env, NODE_ENV: 'test' },
        });
        const output = [stdout, stderr].filter(Boolean).join('\n---stderr---\n');
        return { result: `exit_code: 0\n${output}`, done: false };
      } catch (err: unknown) {
        const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
        const output = [e.stdout, e.stderr].filter(Boolean).join('\n---stderr---\n');
        return { result: `exit_code: ${e.code ?? 1}\n${output || e.message}`, done: false };
      }
    }

    case 'done': {
      return { result: (input.summary as string) || 'Done', done: true };
    }

    default:
      return { result: `Unknown tool: ${name}`, done: false };
  }
}

async function walkAndMatch(base: string, pattern: string, rel = ''): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(join(base, rel), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...await walkAndMatch(base, pattern, entryRel));
    } else if (minimatch(entryRel, pattern)) {
      results.push(entryRel);
    }
  }
  return results;
}
