// ============================================================
// Bug Auto-Fix Agent — Entry Point
// ============================================================

import { loadConfig } from "./config";
import { startWebhookServer } from "./github/webhook";
import { runPipeline } from "./pipeline";
import { createLogger } from "./utils/logger";
import { cleanupOldRuns } from "./fs/repo";
import type { GitHubIssue, GitHubRepo } from "./types";

const log = createLogger("main");

async function main() {
  log.info("============================================");
  log.info("🤖 Bug Auto-Fix Agent starting...");
  log.info("============================================");

  // Load & validate config
  const config = loadConfig();
  log.info("Config loaded", {
    autoFixEnabled: config.AUTO_FIX_ENABLED,
    port: config.PORT,
    model: config.LLM_MODEL,
    workspace: config.WORKSPACE_DIR,
  });

  // Periodic cleanup of old workspace runs
  setInterval(() => {
    cleanupOldRuns(3600_000).catch(() => {});
  }, 600_000); // every 10 minutes

  // Handle incoming issues
  const handleIssue = async (issue: GitHubIssue, repo: GitHubRepo) => {
    if (!config.AUTO_FIX_ENABLED) {
      log.info("Auto-fix disabled — ignoring issue", { number: issue.number });
      return;
    }

    log.info("Processing issue", {
      number: issue.number,
      title: issue.title,
      repo: repo.full_name,
    });

    const result = await runPipeline(issue, repo);

    log.info("Pipeline result", {
      issue: issue.number,
      status: result.status,
      stage: result.stage,
      duration: result.completedAt
        ? `${result.completedAt.getTime() - result.startedAt.getTime()}ms`
        : "N/A",
    });
  };

  // Start webhook server
  startWebhookServer(handleIssue);

  log.info("✅ Agent ready — waiting for webhooks...");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});