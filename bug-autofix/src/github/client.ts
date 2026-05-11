// ============================================================
// GitHub REST API client (Octokit wrapper)
// ============================================================

import { Octokit } from "@octokit/rest";
import { getConfig } from "../config";
import { createLogger } from "../utils/logger";
import { retry } from "../utils/retry";
import type { GitHubIssue, GitHubRepo, CIStatus } from "../types";

const log = createLogger("github-client");

let _octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!_octokit) {
    _octokit = new Octokit({ auth: getConfig().GITHUB_TOKEN });
  }
  return _octokit;
}

function splitRepo(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  return { owner, repo };
}

// ── Issues ──

export async function getIssue(
  fullName: string,
  issueNumber: number,
): Promise<GitHubIssue> {
  const { owner, repo } = splitRepo(fullName);
  const kit = getOctokit();

  return retry(async () => {
    const { data } = await kit.issues.get({ owner, repo, issue_number: issueNumber });
    return {
      number: data.number,
      title: data.title,
      body: data.body ?? "",
      state: data.state as "open" | "closed",
      user: { login: data.user?.login ?? "unknown", id: data.user?.id ?? 0, avatar_url: data.user?.avatar_url ?? "" },
      labels: (data.labels ?? []).map((l: any) => ({
        name: typeof l === "string" ? l : l.name ?? "",
        color: typeof l === "string" ? "" : l.color ?? "",
      })),
      html_url: data.html_url,
      created_at: data.created_at,
      updated_at: data.updated_at,
      repository_url: data.repository_url ?? "",
    };
  });
}

export async function addLabels(
  fullName: string,
  issueNumber: number,
  labels: string[],
): Promise<void> {
  const { owner, repo } = splitRepo(fullName);
  const kit = getOctokit();

  await retry(async () => {
    await kit.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels,
    });
  });
  log.info("Labels added", { issue: issueNumber, labels });
}

export async function addComment(
  fullName: string,
  issueNumber: number,
  body: string,
): Promise<void> {
  const { owner, repo } = splitRepo(fullName);
  const kit = getOctokit();

  await retry(async () => {
    await kit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  });
  log.info("Comment added", { issue: issueNumber });
}

// ── Repository ──

export async function getRepo(fullName: string): Promise<GitHubRepo> {
  const { owner, repo } = splitRepo(fullName);
  const kit = getOctokit();

  return retry(async () => {
    const { data } = await kit.repos.get({ owner, repo });
    return {
      full_name: data.full_name,
      owner: { login: data.owner.login, id: data.owner.id },
      name: data.name,
      clone_url: data.clone_url ?? "",
      default_branch: data.default_branch,
      html_url: data.html_url,
    };
  });
}

// ── PRs ──

export async function createPR(
  fullName: string,
  title: string,
  body: string,
  headBranch: string,
  baseBranch: string,
): Promise<{ number: number; url: string }> {
  const { owner, repo } = splitRepo(fullName);
  const kit = getOctokit();

  return retry(async () => {
    const { data } = await kit.pulls.create({
      owner,
      repo,
      title,
      body,
      head: headBranch,
      base: baseBranch,
    });
    log.info("PR created", { number: data.number, url: data.html_url });
    return { number: data.number, url: data.html_url };
  });
}

// ── CI ──

export async function getCIStatus(
  fullName: string,
  ref: string,
): Promise<CIStatus> {
  const { owner, repo } = splitRepo(fullName);
  const kit = getOctokit();

  try {
    const { data } = await kit.checks.listForRef({
      owner,
      repo,
      ref,
      filter: "latest",
    });

    const checks = data.check_runs;
    const total = checks.length;
    const passed = checks.filter((c) => c.conclusion === "success").length;
    const failed = checks.filter(
      (c) =>
        c.conclusion === "failure" ||
        c.conclusion === "timed_out" ||
        c.conclusion === "action_required",
    ).length;
    const pending = checks.filter(
      (c) =>
        !c.conclusion ||
        c.status === "in_progress" ||
        c.status === "queued",
    ).length;

    let state: CIStatus["state"] = "pending";
    if (pending === 0) {
      state = failed > 0 ? "failure" : "success";
    }

    return {
      state,
      totalChecks: total,
      passedChecks: passed,
      failedChecks: failed,
      details: checks.map((c) => `${c.name}: ${c.conclusion || c.status}`),
      url: checks[0]?.html_url ?? "",
    };
  } catch {
    return {
      state: "pending",
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      details: ["Unable to fetch CI status"],
      url: "",
    };
  }
}

export async function getRepoFile(
  fullName: string,
  filePath: string,
  ref?: string,
): Promise<string> {
  const { owner, repo } = splitRepo(fullName);
  const kit = getOctokit();

  return retry(async () => {
    const { data } = await kit.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref,
    });
    if ("content" in data && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    throw new Error(`File ${filePath} not found or is a directory`);
  });
}