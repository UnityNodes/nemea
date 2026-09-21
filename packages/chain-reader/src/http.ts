import type { Chain } from "@nemea/shared-types";
import { ChainReadError } from "./types.ts";

export type HttpResult = { status: number; headers: Headers; text: string };

export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return "request failed";
  const code = error.cause instanceof Error && "code" in error.cause ? String(error.cause.code) : null;
  return code ? `${error.message} (${code})` : error.message;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export async function httpGet(fetchImpl: typeof fetch, url: string, timeoutMs: number, chain: Chain, provider: string): Promise<HttpResult> {
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    return { status: res.status, headers: res.headers, text };
  } catch (error) {
    if (isTimeout(error)) throw new ChainReadError(chain, provider, "timeout", `no answer within ${timeoutMs}ms`);
    throw new ChainReadError(chain, provider, "network", describeFailure(error));
  }
}

export function parseJson(text: string, chain: Chain, provider: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ChainReadError(chain, provider, "bad_response", "body is not JSON");
  }
}

export function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function retryAfterMs(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (raw === null || raw.trim() === "") return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
}

export const DIGITS_ONLY = /^[0-9]+$/;
export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
