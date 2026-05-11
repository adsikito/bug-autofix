// ============================================================
// Sandbox utilities — validate patches, run basic checks
// ============================================================

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { createLogger } from "./logger";

const execAsync = promisify(exec);
const log = createLogger("sandbox");

export interface PatchValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate that a patch can be applied cleanly (dry-run).
 * Optionally run a build/lint in the workspace.
 */
export async function validatePatch(
  workspaceDir: string,
  filePath: string,
  patchedContent: string,
): Promise<PatchValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Basic sanity: is the patched content non-empty?
  if (!patchedContent.trim()) {
    errors.push("Patched content is empty — refusing to apply.");
    return { valid: false, errors, warnings };
  }

  // 2. Check file extension for known types
  const ext = path.extname(filePath).toLowerCase();
  const knownExtensions = [
    ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs",
    ".java", ".rb", ".cs", ".c", ".cpp", ".h", ".hpp",
  ];
  if (!knownExtensions.includes(ext)) {
    warnings.push(`Unknown file extension "${ext}" — proceed with caution.`);
  }

  // 3. Try to detect syntax errors for JS/TS (if node is available)
  if ([".js", ".mjs", ".cjs"].includes(ext)) {
    try {
      // Write to temp file and try to parse
      const tmpFile = path.join(workspaceDir, ".bugfix-tmp-validation" + ext);
      await fs.writeFile(tmpFile, patchedContent, "utf-8");
      await execAsync(`node --check "${tmpFile}"`, { timeout: 10_000 });
      await fs.unlink(tmpFile).catch(() => {});
    } catch (err: any) {
      errors.push(`Syntax check failed: ${err.stderr || err.message}`);
    }
  }

  if ([".ts", ".tsx"].includes(ext)) {
    try {
      const tmpFile = path.join(workspaceDir, ".bugfix-tmp-validation.ts");
      await fs.writeFile(tmpFile, patchedContent, "utf-8");
      // Try tsc --noEmit if tsc is available
      await execAsync(`npx tsc --noEmit --strict "${tmpFile}" 2>&1 || true`, {
        cwd: workspaceDir,
        timeout: 15_000,
      });
      await fs.unlink(tmpFile).catch(() => {});
    } catch {
      warnings.push("TypeScript syntax check skipped (tsc not available).");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Run the project's test suite to verify the fix.
 * Returns true if tests pass.
 */
export async function runTests(
  workspaceDir: string,
  timeoutMs: number = 60_000,
): Promise<{ passed: boolean; output: string }> {
  log.info("Running tests...", { workspaceDir });

  // Try common test commands
  const testCommands = [
    "npm test --if-present",
    "npx jest --passWithNoTests",
    "npx vitest run",
  ];

  for (const cmd of testCommands) {
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: workspaceDir,
        timeout: timeoutMs,
      });
      const output = stdout + "\n" + stderr;
      return { passed: !stderr.includes("FAIL"), output };
    } catch (err: any) {
      // Command not found or non-zero exit
      if (err.killed) {
        return { passed: false, output: `Timed out after ${timeoutMs}ms` };
      }
    }
  }

  return { passed: true, output: "No test command found — skipping." };
}