// ============================================================
// CI Watcher — monitor CI status on a PR
// ============================================================

import { createLogger } from "./utils/logger";
import { getCIStatus, addComment } from "./github/client";
import type { GitHubRepo, PRResult, CIStatus } from "./types";

const log = createLogger("ci-watcher");

export interface CIWatchOptions {
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

const DEFAULTS: Required<CIWatchOptions> = {
  pollIntervalMs: 30_000, // 30 seconds
  maxWaitMs: 600_000, // 10 minutes
};

/**
 * Poll CI status until all checks complete or timeout.
 * Returns final status and optionally comments on the issue.
 */
export async function watchCI(
  fullName: string,
  branchName: string,
  issueNumber: number,
  options: CIWatchOptions = {},
): Promise<CIStatus> {
  const opts = { ...DEFAULTS, ...options };
  const startedAt = Date.now();

  log.info("Watching CI", { repo: fullName, branch: branchName });

  while (Date.now() - startedAt < opts.maxWaitMs) {
    const status = await getCIStatus(fullName, branchName);

    if (status.state === "success") {
      log.info("CI passed! 🎉", { checks: status.totalChecks });
      return status;
    }

    if (status.state === "failure" || status.state === "error") {
      log.warn("CI failed 😞", {
        passed: status.passedChecks,
        failed: status.failedChecks,
      });
      await addComment(
        fullName,
        issueNumber,
        `⚠️ **CI checks failed** on the auto-fix PR.\n\n` +
        `${status.failedChecks}/${status.totalChecks} checks failed.\n` +
        status.details.map((d) => `- ${d}`).join("\n"),
      );
      return status;
    }

    log.debug("CI still pending...", {
      total: status.totalChecks,
      passed: status.passedChecks,
    });
    await sleep(opts.pollIntervalMs);
  }

  log.warn("CI watch timed out");
  return {
    state: "pending",
    totalChecks: 0,
    passedChecks: 0,
    failedChecks: 0,
    details: ["Timed out waiting for CI"],
    url: "",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}