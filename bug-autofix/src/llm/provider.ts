// ============================================================
// LLM provider (Anthropic Claude)
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../config";
import { createLogger } from "../utils/logger";
import { retry } from "../utils/retry";
import type { LLMMessage } from "../types";

const log = createLogger("llm");

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: getConfig().ANTHROPIC_API_KEY });
  }
  return _client;
}

export interface LLMCallOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * Send messages to Claude and get a text response.
 */
export async function complete(
  messages: LLMMessage[],
  options: LLMCallOptions = {},
): Promise<string> {
  const client = getClient();
  const config = getConfig();
  const model = options.model || config.LLM_MODEL;

  log.debug("LLM call", { model, messageCount: messages.length });

  return retry(async () => {
    const response = await client.messages.create({
      model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.2,
      system: options.systemPrompt,
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    // Extract text from response
    const textBlocks = response.content.filter((b) => b.type === "text");
    const text = textBlocks.map((b: any) => b.text).join("\n");

    log.debug("LLM response received", {
      model,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    });

    return text;
  });
}

/**
 * Convenience: single-prompt completion.
 */
export async function ask(
  prompt: string,
  options: LLMCallOptions = {},
): Promise<string> {
  return complete([{ role: "user", content: prompt }], options);
}

/**
 * Parse a JSON response from the LLM.
 * Handles markdown code fences.
 */
export function extractJSON(text: string): any {
  // Try to extract from ```json blocks
  const jsonBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonBlock ? jsonBlock[1].trim() : text.trim();

  // Try to find the outermost { or [
  const startBrace = jsonStr.indexOf("{");
  const startBracket = jsonStr.indexOf("[");
  let start = -1;
  if (startBrace !== -1 && startBracket !== -1) {
    start = Math.min(startBrace, startBracket);
  } else if (startBrace !== -1) {
    start = startBrace;
  } else if (startBracket !== -1) {
    start = startBracket;
  }

  if (start !== -1) {
    try {
      return JSON.parse(jsonStr.slice(start));
    } catch {
      // Try parsing the whole thing
    }
  }

  return JSON.parse(jsonStr);
}