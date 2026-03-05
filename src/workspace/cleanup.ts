import { rm } from 'node:fs/promises';

export async function cleanupWorkspace(workDir: string): Promise<void> {
  try {
    await rm(workDir, { recursive: true, force: true });
    console.log(`  [workspace] Cleaned up: ${workDir}`);
  } catch {
    console.warn(`  [workspace] Failed to clean up: ${workDir}`);
  }
}
