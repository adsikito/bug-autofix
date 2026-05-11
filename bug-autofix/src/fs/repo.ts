// ============================================================
// Workspace / filesystem operations
// ============================================================

import * as fs from "fs/promises";
import * as path from "path";
import { getConfig } from "../config";
import { createLogger } from "../utils/logger";
import * as Diff from "diff";
import { randomUUID } from "crypto";

const log = createLogger("fs-repo");

export function getWorkspaceDir(): string {
  return getConfig().WORKSPACE_DIR;
}

export function createRunDir(): string {
  const runId = randomUUID().slice(0, 8);
  const dir = path.join(getWorkspaceDir(), `run-${runId}`);
  return dir;
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

export async function writeFile(
  filePath: string,
  content: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function removeDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  log.debug("Removed directory", { dir });
}

export async function cleanupOldRuns(maxAgeMs: number = 3600_000): Promise<void> {
  const workspace = getWorkspaceDir();
  try {
    const entries = await fs.readdir(workspace);
    const now = Date.now();
    for (const entry of entries) {
      if (!entry.startsWith("run-")) continue;
      const fullPath = path.join(workspace, entry);
      const stat = await fs.stat(fullPath);
      if (now - stat.mtimeMs > maxAgeMs) {
        await removeDir(fullPath);
      }
    }
  } catch {
    // Workspace dir might not exist yet
  }
}

/**
 * Generate a unified diff between two strings.
 */
export function generateDiff(
  original: string,
  patched: string,
  filePath: string,
): string {
  const patch = Diff.createPatch(filePath, original, patched, "original", "patched");
  return patch;
}

/**
 * Apply a unified diff patch to content (simple string replacement).
 * Uses the `diff` library's applyPatch.
 */
export function applyPatch(original: string, patchStr: string): string | false {
  const result = Diff.applyPatch(original, patchStr);
  return typeof result === "string" ? result : false;
}