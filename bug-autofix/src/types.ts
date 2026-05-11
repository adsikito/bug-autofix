// ============================================================
// Core types for Bug Auto-Fix Agent
// ============================================================

/** Severity levels for bug triage */
export type Severity = "critical" | "high" | "medium" | "low";

/** Current stage of the auto-fix pipeline */
export type PipelineStage =
  | "received"
  | "triaging"
  | "locating"
  | "fixing"
  | "building_pr"
  | "ci_watching"
  | "done"
  | "failed";

/** Outcome of a single pipeline run */
export type PipelineStatus = "success" | "failed" | "skipped" | "in_progress";

// ── GitHub webhook payloads (subset) ──

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
}

export interface GitHubLabel {
  name: string;
  color: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  user: GitHubUser;
  labels: GitHubLabel[];
  html_url: string;
  created_at: string;
  updated_at: string;
  repository_url: string;
}

export interface GitHubRepo {
  full_name: string; // "owner/repo"
  owner: { login: string; id: number };
  name: string;
  clone_url: string;
  default_branch: string;
  html_url: string;
}

export interface IssueOpenedPayload {
  action: "opened" | "labeled" | "edited";
  issue: GitHubIssue;
  repository: GitHubRepo;
  sender: GitHubUser;
}

// ── Triage result ──

export interface TriageResult {
  isBug: boolean;
  severity: Severity;
  confidence: number; // 0-1
  summary: string;
  suggestedLabels: string[];
  reasoning: string;
}

// ── Locator result ──

export interface LocatedFile {
  path: string;
  relevance: number; // 0-1
  reasoning: string;
  suggestedStartLine?: number;
  suggestedEndLine?: number;
}

export interface LocatorResult {
  files: LocatedFile[];
  rootCause: string;
  confidence: number;
}

// ── Fix result ──

export interface FilePatch {
  path: string;
  originalContent: string;
  patchedContent: string;
  diff: string;
  explanation: string;
}

export interface FixResult {
  patches: FilePatch[];
  summary: string;
  riskAssessment: string;
  testPlan: string;
}

// ── PR payload ──

export interface PROptions {
  title: string;
  body: string;
  branchName: string;
  baseBranch: string;
}

export interface PRResult {
  number: number;
  url: string;
  branchName: string;
}

// ── CI status ──

export interface CIStatus {
  state: "pending" | "success" | "failure" | "error";
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  details: string[];
  url: string;
}

// ── Pipeline run context ──

export interface PipelineContext {
  runId: string;
  issue: GitHubIssue;
  repo: GitHubRepo;
  stage: PipelineStage;
  status: PipelineStatus;
  triage?: TriageResult;
  locator?: LocatorResult;
  fix?: FixResult;
  pr?: PRResult;
  ci?: CIStatus;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

// ── LLM message types ──

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

// ── Logger interfaces ──

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  debug(msg: string, data?: Record<string, unknown>): void;
  child(data: Record<string, unknown>): Logger;
}