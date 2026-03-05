import { readFile } from 'node:fs/promises';
import type { Blueprint } from './types.js';

export async function parseBlueprint(filePath: string): Promise<Blueprint> {
  const raw = await readFile(filePath, 'utf-8');
  const lines = raw.split('\n');

  const name = extractTitle(lines) ?? 'Untitled';
  const systemPrompt = extractSection(lines, 'System Prompt');
  const task = extractSection(lines, 'Task') ?? '';
  const scaffold = extractSection(lines, 'Scaffold');
  const testCommand = extractCodeBlock(lines, 'Test Command') ?? 'npm test';
  const successCriteria = extractList(lines, 'Success Criteria');

  return { name, systemPrompt, task, scaffold, testCommand, successCriteria };
}

function extractTitle(lines: string[]): string | undefined {
  for (const line of lines) {
    const match = line.match(/^#\s+(?:Blueprint:\s*)?(.+)/);
    if (match) return match[1].trim();
  }
  return undefined;
}

function extractSection(lines: string[], heading: string): string | undefined {
  const start = findHeading(lines, heading);
  if (start === -1) return undefined;

  const contentLines: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    contentLines.push(lines[i]);
  }
  const result = contentLines.join('\n').trim();
  return result || undefined;
}

function extractCodeBlock(lines: string[], heading: string): string | undefined {
  const start = findHeading(lines, heading);
  if (start === -1) return undefined;

  let inBlock = false;
  const codeLines: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i]) && !inBlock) break;
    if (lines[i].startsWith('```') && !inBlock) {
      inBlock = true;
      continue;
    }
    if (lines[i].startsWith('```') && inBlock) break;
    if (inBlock) codeLines.push(lines[i]);
  }
  const result = codeLines.join('\n').trim();
  return result || undefined;
}

function extractList(lines: string[], heading: string): string[] {
  const start = findHeading(lines, heading);
  if (start === -1) return [];

  const items: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    const match = lines[i].match(/^[-*]\s+(.+)/);
    if (match) items.push(match[1].trim());
  }
  return items;
}

function findHeading(lines: string[], heading: string): number {
  return lines.findIndex((line) => {
    const match = line.match(/^##\s+(.+)/);
    return match && match[1].trim().toLowerCase() === heading.toLowerCase();
  });
}
