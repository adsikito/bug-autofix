// ============================================================
// Structured logger (pino)
// ============================================================

import pino from "pino";
import { getConfig, type Config } from "../config";
import type { Logger } from "../types";

let _logger: pino.Logger | null = null;

function createPinoLogger(config: Config): pino.Logger {
  return pino({
    level: config.LOG_LEVEL,
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
        : undefined,
    base: { pid: process.pid },
  });
}

export function getLogger(): pino.Logger {
  if (!_logger) {
    _logger = createPinoLogger(getConfig());
  }
  return _logger;
}

/** Adapt pino logger to our Logger interface for dependency injection */
export function createLogger(name: string): Logger {
  const base = getLogger().child({ module: name });
  return {
    info: (msg, data) => base.info(data ?? {}, msg),
    warn: (msg, data) => base.warn(data ?? {}, msg),
    error: (msg, data) => base.error(data ?? {}, msg),
    debug: (msg, data) => base.debug(data ?? {}, msg),
    child: (data) => createLogger(`${name}:${JSON.stringify(data)}`),
  };
}