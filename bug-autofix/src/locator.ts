// ============================================================
// Bug Locator — find relevant files/code for a bug
// ============================================================

import { ask, extractJSON } from "./llm/provider";
import { createLogger } from "./utils/logger";
import type { GitHubIssue, LocatorResult, LocatedFile } from "./types";

const log = createLogger("locator");

const SYSTEM_PROMPT = `You are an expert software engineer. Given a bug report and the repository file listing, identify which files need to be modified to fix the bug and explain the root cause.

Respond ONLY with valid JSON:
{
  "files": [
    {
      "path": "src/file.ts",
      "relevance": 0.0-1.0,
      "reasoning": "why this file is relevant",
      "suggestedStartLine": 10 (optional),
      "suggestedEndLine": 50 (optional)
    }
  ],
  "rootCause": "detailed explanation of the bug's root cause",
  "confidence": 0.0-1.0
}

Be precise and specific. Only include files that genuinely need changes.`;

export interface FileListing {
  path: string;
  type: "file" | "directory";
}

export async function locateBug(
  issue: GitHubIssue,
  fileListing: FileListing[],
  fileContents?: Map<string, string>,
): Promise<LocatorResult> {
  log.info("Locating bug", { issue: issue.number });

  let filesContext = "Repository file tree:\n";
  for (const f of fileListing.slice(0, 200)) {
    filesContext += `  ${f.type === "directory" ? "📁" : "📄"} ${f.path}\n`;
  }

  if (fileContents && fileContents.size > 0) {
    filesContext += "\nKey file contents:\n";
    for (const [path, content] of fileContents.entries()) {
      // Truncate large files
      const truncated = content.length > 3000
        ? content.slice(0, 3000) + "\n... (truncated)"
        : content;
      filesContext += `\n--- ${path} ---\n${truncated}\n`;
    }
  }

  const prompt = `Bug Report:
Title: ${issue.title}
Body: ${issue.body || "(no description)"}

${filesContext}

Identify the files that need to be modified to fix this bug.`;

  const response = await ask(prompt, {
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.2,
    maxTokens: 2048,
  });

  const result = extractJSON(response) as LocatorResult;

  // Validate structure
  if (!Array.isArray(result.files)) {
    log.warn("Invalid locator response", { response });
    return { files: [], rootCause: "Unable to locate", confidence: 0 };
  }

  log.info("Bug located", {
    fileCount: result.files.length,
    confidence: result.confidence,
  });

  return result;
}