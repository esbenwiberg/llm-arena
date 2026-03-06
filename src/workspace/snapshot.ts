import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function getCodeSnapshot(dir: string): Promise<string> {
  const parts: string[] = [];
  await walkDir(dir, '', parts, 0);
  return parts.join('\n\n');
}

async function walkDir(base: string, rel: string, parts: string[], depth: number): Promise<void> {
  if (depth > 4) return;
  const entries = await readdir(join(base, rel), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await walkDir(base, entryRel, parts, depth + 1);
    } else if (/\.(ts|js|json|md|yml|yaml)$/.test(entry.name)) {
      try {
        const content = await readFile(join(base, entryRel), 'utf-8');
        if (content.length < 10_000) {
          parts.push(`### ${entryRel}\n\`\`\`\n${content}\n\`\`\``);
        }
      } catch { /* skip unreadable files */ }
    }
  }
}
