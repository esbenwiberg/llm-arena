import { mkdtemp, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import type { Blueprint } from '../types.js';

export async function createWorkspace(blueprint: Blueprint, blueprintPath: string): Promise<string> {
  const workDir = await mkdtemp(join(tmpdir(), 'arena-'));

  if (blueprint.scaffold) {
    const scaffoldPath = join(
      blueprintPath.replace(/[^/]+$/, ''),
      blueprint.scaffold,
    );
    if (existsSync(scaffoldPath)) {
      await cp(scaffoldPath, workDir, { recursive: true });
      console.log(`  [workspace] Scaffolded from ${scaffoldPath}`);
    } else {
      console.log(`  [workspace] Scaffold path not found: ${scaffoldPath}, starting empty`);
    }
  }

  console.log(`  [workspace] Created: ${workDir}`);
  return workDir;
}
