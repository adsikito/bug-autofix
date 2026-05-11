// ============================================================
// Auto Fixer — generate code patches via LLM
// ============================================================

import { ask, extractJSON } from "./llm/provider";
import { createLogger } from "./utils/logger";
import { validatePatch } from "./utils/sandbox";
import type {
  GitHubIssue,
  FixResult,
  FilePatch,
  TriageResult,
  LocatorResult,
} from "./types";

const log = createLogger("fixer");

const SYSTEM_PROMPT = `You are an expert software engineer tasked with fixing bugs. 
Given a bug report, its root cause analysis, and the current file contents, produce a fix.

Respond ONLY with valid JSON:
{
  "patches": [
    {
      "path": "src/file.ts",
      "originalContent": "the original code snippet that needs changing (NOT the entire file, just the relevant section)",
      "patchedContent": "the fixed code snippet",
      "explanation": "what was changed and why"
    }
  ],
  "summary": "one-sentence summary of all changes",
  "riskAssessment": "low/medium/high - assessment of fix risk",
  "testPlan": "how to verify the fix works"
}

IMPORTANT RULES:
- Make minimal, surgical changes — don't refactor unrelated code
- Preserve existing code style and conventions
- Include proper error handling
- Do NOT include the entire file — only the specific sections being changed
- Ensure the fix addresses the root cause, not just symptoms`;

/**
 * Generate a fix for the identified bug.
 * Reads current file contents from the workspace.
 */
export async function generateFix(
  issue: GitHubIssue,
  triage: TriageResult,
  locator: LocatorResult,
  fileContents: Map<string, string>,
  workspaceDir: string,
): Promise<FixResult> {
  log.info("Generating fix", { issue: issue.number, files: locator.files.length });

  // Build prompt with current file contents
  let context = `Bug Report: ${issue.title}\n${issue.body || ""}\n\n`;
  context += `Severity: ${triage.severity}\n`;
  context += `Root Cause: ${locator.rootCause}\n\n`;

  context += "Relevant files and their current contents:\n";
  for (const file of locator.files) {
    const content = fileContents.get(file.path);
    if (content) {
      context += `\n### ${file.path}\n\`\`\`\n${content}\n\`\`\`\n`;
    } else {
      context += `\n### ${file.path}\n(file not available locally)\n`;
    }
  }

  const response = await ask(context, {
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.1,
    maxTokens: 8192,
  });

  const result = extractJSON(response) as FixResult;

  if (!Array.isArray(result.patches)) {
    log.error("Invalid fix response", { response });
    throw new Error("LLM returned invalid fix structure");
  }

  // Validate each patch
  for (const patch of result.patches) {
    const validation = await validatePatch(workspaceDir, patch.path, patch.patchedContent);
    if (!validation.valid) {
      log.warn("Patch validation failed", {
        path: patch.path,
        errors: validation.errors,
      });
      patch.explanation += `\n⚠️ Validation warnings: ${validation.errors.join("; ")}`;
    }
  }

  log.info("Fix generated", {
    patchCount: result.patches.length,
    risk: result.riskAssessment,
  });

  return result;
}