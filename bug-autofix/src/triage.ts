// ============================================================
// Bug Triage — determine if an issue is a bug & assess severity
// ============================================================

import { ask, extractJSON } from "./llm/provider";
import { createLogger } from "./utils/logger";
import type { GitHubIssue, TriageResult, Severity } from "./types";

const log = createLogger("triage");

const SYSTEM_PROMPT = `You are a bug triage expert. Analyze the following GitHub issue and determine:

1. Is this a bug report? (not a feature request, question, or discussion)
2. How severe is it? (critical / high / medium / low)
3. What is a brief summary?
4. What labels would you suggest?
5. Your confidence level (0.0 to 1.0)

Respond ONLY with valid JSON in this format:
{
  "isBug": true/false,
  "severity": "critical" | "high" | "medium" | "low",
  "confidence": 0.0-1.0,
  "summary": "brief one-sentence summary",
  "suggestedLabels": ["label1", "label2"],
  "reasoning": "your analysis"
}

Severity guidelines:
- critical: data loss, security, complete system outage
- high: core functionality broken, no workaround
- medium: feature partially broken, workaround exists
- low: cosmetic, minor inconvenience`;

export async function triageIssue(issue: GitHubIssue): Promise<TriageResult> {
  log.info("Triaging issue", { number: issue.number, title: issue.title });

  const prompt = `Issue #${issue.number}: ${issue.title}

${issue.body || "(No description provided)"}

Labels: ${issue.labels.map((l) => l.name).join(", ") || "none"}`;

  const response = await ask(prompt, {
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.1,
    maxTokens: 1024,
  });

  const result = extractJSON(response) as TriageResult;

  // Validate
  if (typeof result.isBug !== "boolean") {
    log.warn("LLM returned invalid triage result", { response });
    return {
      isBug: false,
      severity: "low",
      confidence: 0,
      summary: "Unable to triage",
      suggestedLabels: [],
      reasoning: "LLM response was malformed",
    };
  }

  log.info("Triage complete", {
    isBug: result.isBug,
    severity: result.severity,
    confidence: result.confidence,
  });

  return result;
}