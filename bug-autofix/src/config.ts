// ============================================================
// Configuration — loads from .env, validates with zod
// ============================================================

import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const configSchema = z.object({
  // GitHub
  GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN is required"),
  GITHUB_WEBHOOK_SECRET: z.string().min(1, "GITHUB_WEBHOOK_SECRET is required"),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  LLM_MODEL: z.string().default("claude-sonnet-4-20250514"),

  // Server
  PORT: z.coerce.number().default(3000),

  // Feature flags
  AUTO_FIX_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  // Paths
  WORKSPACE_DIR: z.string().default("/tmp/bug-autofix-workspace"),

  // Logging
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof configSchema>;

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;
  const raw = {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
    PORT: process.env.PORT,
    AUTO_FIX_ENABLED: process.env.AUTO_FIX_ENABLED,
    WORKSPACE_DIR: process.env.WORKSPACE_DIR,
    LOG_LEVEL: process.env.LOG_LEVEL,
  };
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    console.error("❌ Invalid config:", result.error.format());
    process.exit(1);
  }
  _config = result.data;
  return _config;
}

export function getConfig(): Config {
  if (!_config) return loadConfig();
  return _config;
}