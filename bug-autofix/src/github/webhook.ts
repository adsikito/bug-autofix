// ============================================================
// GitHub Webhook handler (Express)
// ============================================================

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import { getConfig } from "../config";
import { createLogger } from "../utils/logger";
import type { IssueOpenedPayload, GitHubIssue, GitHubRepo } from "../types";

const log = createLogger("webhook");

export type IssueHandler = (
  issue: GitHubIssue,
  repo: GitHubRepo,
) => Promise<void>;

/**
 * Minimal webhook server. Does NOT import Express to keep deps lighter;
 * uses Node's built-in http module with manual body parsing.
 */
export function startWebhookServer(onIssue: IssueHandler): void {
  const config = getConfig();
  const secret = config.GITHUB_WEBHOOK_SECRET;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Health check
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
      return;
    }

    // Only accept POST /webhook
    if (req.method !== "POST" || req.url !== "/webhook") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    // Read body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks).toString("utf-8");

    // Verify signature
    const signature = req.headers["x-hub-signature-256"] as string;
    if (!verifySignature(rawBody, signature, secret)) {
      log.warn("Webhook signature verification failed");
      res.writeHead(401);
      res.end("Invalid signature");
      return;
    }

    // Parse event type
    const event = req.headers["x-github-event"] as string;
    const payload = JSON.parse(rawBody);

    // Respond quickly (GitHub expects 200 within 10s)
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ received: true }));

    // Process asynchronously
    if (event === "issues" && payload.action === "opened") {
      const p = payload as IssueOpenedPayload;
      log.info("Issue opened webhook received", {
        issue: p.issue.number,
        title: p.issue.title,
        repo: p.repository.full_name,
      });
      try {
        await onIssue(p.issue, p.repository);
      } catch (err) {
        log.error("Issue handler failed", { error: String(err) });
      }
    }
  });

  server.listen(config.PORT, () => {
    log.info(`🚀 Webhook server listening on port ${config.PORT}`);
  });
}

function verifySignature(
  payload: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const hmac = createHmac("sha256", secret);
  const digest = `sha256=${hmac.update(payload, "utf-8").digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}