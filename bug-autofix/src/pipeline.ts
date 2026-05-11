// ============================================================
// Main pipeline — orchestrates the full auto-fix flow
// ============================================================

import { randomUUID } from "crypto";
import { getConfig } from "./config";
import { createLogger } from "./utils/logger";
import { cloneRepo } from "./git/ops";
import { createRunDir, ensureDir, removeDir, readFile } from "./fs/repo";
import { addComment, addLabels, getRepo } from "./github/client";
import { triageIssue } from "./triage";
import { locateBug } from "./locator";
import { generateFix } from "./fixer";
import { buildPR } from "./pr-builder";
import { watchCI } from "./ci-watcher";
import type {
  GitHubIssue,
  GitHubRepo,
  PipelineContext,
  PipelineStage,
  PipelineStatus,
} from "./types";
import * as fs from "fs/promises";
import * as path from "path";

const log = createLogger("pipeline");

/**
 * Run the full auto-fix pipeline for a given issue.
 */
export async function runPipeline(
  webhookIssue: GitHubIssue,
  webhookRepo: GitHubRepo,
): Promise<PipelineContext> {
  const runId = `run-${randomUUID().slice(0, 8)}`;
  const ctx: PipelineContext = {
    runId,
    issue: webhookIssue,
    repo: webhookRepo,
    stage: "received",
    status: "in_progress",
    startedAt: new Date(),
  };

  log.info("Pipeline started", { runId, issue: webhookIssue.number });

  try {
    // ── Stage 1: Triage ──
    ctx.stage = "triaging";
    const triage = await triageIssue(webhookIssue);
    ctx.triage = triage;

    if (!triage.isBug) {
      log.info("Not a bug — skipping", { issue: webhookIssue.number });
      ctx.status = "skipped";
      ctx.stage = "done";
      ctx.completedAt = new Date();
      await addLabels(webhookRepo.full_name, webhookIssue.number, ["not-a-bug"]);
      return ctx;
    }

    if (triage.confidence < 0.5) {
      log.info("Low confidence — skipping auto-fix", { confidence: triage.confidence });
      ctx.status = "skipped";
      ctx.stage = "done";
      ctx.completedAt = new Date();
      await addComment(
        webhookRepo.full_name,
        webhookIssue.number,
        `🤖 Auto-fix skipped: triage confidence too low (${(triage.confidence * 100).toFixed(0)}%). A human should review this.`,
      );
      return ctx;
    }

    // ── Stage 2: Clone repo ──
    ctx.stage = "locating";
    const runDir = createRunDir();
    await ensureDir(runDir);
    const repo = await getRepo(webhookRepo.full_name);

    log.info("Cloning repo", { repo: repo.full_name, dir: runDir });
    const git = await cloneRepo({
      url: repo.clone_url.replace(
        "https://",
        `https://x-access-token:${getConfig().GITHUB_TOKEN}@`,
      ),
      dir: runDir,
      branch: repo.default_branch,
    });

    // ── Stage 3: Locate ──
    // Build file listing
    const fileListing = await walkDir(runDir);

    // Read contents of likely files (heuristic: filter by known source extensions)
    const fileContents = new Map<string, string>();
    const sourceExts = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java"];
    for (const f of fileListing.slice(0, 100)) {
      if (f.type === "file" && sourceExts.some((ext) => f.path.endsWith(ext))) {
        try {
          const content = await readFile(path.join(runDir, f.path));
          if (content.length < 50_000) {
            fileContents.set(f.path, content);
          }
        } catch {
          // skip unreadable files
        }
      }
    }

    const locator = await locateBug(webhookIssue, fileListing, fileContents);
    ctx.locator = locator;

    if (locator.files.length === 0) {
      log.warn("No files located — skipping");
      ctx.status = "skipped";
      ctx.stage = "done";
      ctx.completedAt = new Date();
      await removeDir(runDir);
      return ctx;
    }

    // Ensure we have contents for all located files
    for (const f of locator.files) {
      if (!fileContents.has(f.path)) {
        try {
          const content = await readFile(path.join(runDir, f.path));
          fileContents.set(f.path, content);
        } catch {
          log.warn("Could not read located file", { path: f.path });
        }
      }
    }

    // ── Stage 4: Generate fix ──
    ctx.stage = "fixing";
    const fix = await generateFix(
      webhookIssue,
      triage,
      locator,
      fileContents,
      runDir,
    );
    ctx.fix = fix;

    // ── Stage 5: Build PR ──
    ctx.stage = "building_pr";
    const pr = await buildPR(git, webhookIssue, repo, triage, fix, runDir);
    ctx.pr = pr;

    // ── Stage 6: Watch CI (optional) ──
    ctx.stage = "ci_watching";
    const ci = await watchCI(
      repo.full_name,
      pr.branchName,
      webhookIssue.number,
      { maxWaitMs: 300_000 }, // 5 minutes
    );
    ctx.ci = ci;

    // ── Cleanup ──
    await removeDir(runDir);

    // ── Done ──
    ctx.status = ci.state === "failure" ? "failed" : "success";
    ctx.stage = "done";
    ctx.completedAt = new Date();

    log.info("Pipeline complete", {
      runId,
      status: ctx.status,
      pr: pr.url,
      ci: ci.state,
    });

    return ctx;
  } catch (err: any) {
    log.error("Pipeline failed", { runId, error: err.message });
    ctx.status = "failed";
    ctx.stage = "failed";
    ctx.error = err.message;
    ctx.completedAt = new Date();

    try {
      await addComment(
        webhookRepo.full_name,
        webhookIssue.number,
        `❌ **Auto-fix pipeline failed:** ${err.message}\n\nRun ID: \`${runId}\``,
      );
    } catch {
      // best effort
    }

    return ctx;
  }
}

async function walkDir(
  dir: string,
  basePath: string = "",
): Promise<{ path: string; type: "file" | "directory" }[]> {
  const results: { path: string; type: "file" | "directory" }[] = [];
  const ignore = [".git", "node_modules", "dist", "build", ".next", "__pycache__", "target"];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignore.includes(entry.name)) continue;
      const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push({ path: relPath, type: "directory" });
        const children = await walkDir(path.join(dir, entry.name), relPath);
        results.push(...children);
      } else if (entry.isFile()) {
        results.push({ path: relPath, type: "file" });
      }
    }
  } catch {
    // skip inaccessible dirs
  }

  return results;
}