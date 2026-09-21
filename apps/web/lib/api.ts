import type { ApiError } from "@nemea/shared-types";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const inner = (value as { error: unknown }).error;
  return typeof inner === "object" && inner !== null && typeof (inner as { message?: unknown }).message === "string";
}

function fallbackMessage(status: number): string {
  if (status === 401) return "Your session ended. Sign in or continue as a guest.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "Nemea's server could not be reached right now. Try again in a moment.";
  return `The request failed (status ${status}).`;
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = { method: options.method ?? "GET", credentials: "include", headers, cache: "no-store" };
  if (options.signal) init.signal = options.signal;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiClientError(0, "network", "Could not reach Nemea. Check your connection and try again.");
  }
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!response.ok) {
    if (isApiError(parsed)) throw new ApiClientError(response.status, parsed.error.code, parsed.error.message);
    throw new ApiClientError(response.status, "http_error", fallbackMessage(response.status));
  }
  return parsed as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}
