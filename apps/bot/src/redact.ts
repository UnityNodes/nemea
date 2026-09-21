import { HttpError } from "grammy";

const BOT_TOKEN_IN_URL = /bot\d+:[A-Za-z0-9_-]+/g;
const MAX_CAUSE_DEPTH = 3;

export function redact(text: string, token: string): string {
  const withoutUrlTokens = text.replace(BOT_TOKEN_IN_URL, "bot<redacted>");
  return token === "" ? withoutUrlTokens : withoutUrlTokens.split(token).join("<redacted>");
}

export function describeError(error: unknown, token: string): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && parts.length < MAX_CAUSE_DEPTH) {
    parts.push(`${current.name}: ${current.message}`);
    current = current instanceof HttpError ? current.error : current.cause;
  }
  if (parts.length === 0) parts.push(String(error));
  return redact(parts.join(" <- "), token);
}
