import type { z } from "zod";
import type { InternalTelegramLink } from "@nemea/shared-types";
import {
  ApiErrorBody,
  LinkResponse,
  SummaryResponse,
  UnlinkResponse,
  type LinkOutcome,
} from "./contract.ts";

export const REQUEST_TIMEOUT_MS = 8000;

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export type InternalApiClientOptions = {
  origin: string;
  secret: string;
  fetch: FetchFn;
  timeoutMs?: number;
};

export class ApiUnreachableError extends Error {
  override name = "ApiUnreachableError";
}

export class ApiProtocolError extends Error {
  override name = "ApiProtocolError";
}

type RawResponse = { status: number; text: string };

function describeCause(cause: unknown): string {
  return cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
}

export class InternalApiClient {
  readonly #origin: string;
  readonly #secret: string;
  readonly #fetch: FetchFn;
  readonly #timeoutMs: number;

  constructor(options: InternalApiClientOptions) {
    this.#origin = options.origin.replace(/\/+$/, "");
    this.#secret = options.secret;
    this.#fetch = options.fetch;
    this.#timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async link(input: InternalTelegramLink): Promise<LinkOutcome> {
    const label = "POST /internal/telegram/link";
    const res = await this.#send("POST", "/internal/telegram/link", input);
    if (res.status === 200) {
      this.#parse(LinkResponse, label, res);
      return "linked";
    }
    const errorCode = this.#errorCode(res);
    if (res.status === 404 && errorCode === "invalid_code") return "invalid_code";
    if (res.status === 410 && errorCode === "expired_code") return "expired_code";
    throw this.#unexpectedStatus(label, res);
  }

  async unlink(chatId: string): Promise<{ wasLinked: boolean }> {
    const label = "POST /internal/telegram/unlink";
    const res = await this.#send("POST", "/internal/telegram/unlink", { chatId });
    if (res.status !== 200) throw this.#unexpectedStatus(label, res);
    const body = this.#parse(UnlinkResponse, label, res);
    return { wasLinked: body.wasLinked };
  }

  async summary(chatId: string): Promise<SummaryResponse> {
    const label = "GET /internal/telegram/summary";
    const query = new URLSearchParams({ chatId }).toString();
    const res = await this.#send("GET", `/internal/telegram/summary?${query}`);
    if (res.status !== 200) throw this.#unexpectedStatus(label, res);
    return this.#parse(SummaryResponse, label, res);
  }

  async #send(method: "GET" | "POST", path: string, body?: unknown): Promise<RawResponse> {
    const label = `${method} ${path.split("?")[0]}`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.#secret}`,
      accept: "application/json",
    };
    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this.#timeoutMs),
    };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    try {
      const res = await this.#fetch(`${this.#origin}${path}`, init);
      const text = await res.text();
      return { status: res.status, text };
    } catch (cause) {
      throw new ApiUnreachableError(`${label} failed: ${describeCause(cause)}`, { cause });
    }
  }

  #json(label: string, res: RawResponse): unknown {
    try {
      return JSON.parse(res.text);
    } catch {
      throw new ApiProtocolError(`${label} returned ${res.status} with a body that is not JSON`);
    }
  }

  #parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, label: string, res: RawResponse): T {
    const parsed = schema.safeParse(this.#json(label, res));
    if (parsed.success) return parsed.data;
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new ApiProtocolError(`${label} returned ${res.status} with an invalid body: ${issues}`);
  }

  #errorCode(res: RawResponse): string | null {
    try {
      const parsed = ApiErrorBody.safeParse(JSON.parse(res.text));
      return parsed.success ? parsed.data.error.code : null;
    } catch {
      return null;
    }
  }

  #unexpectedStatus(label: string, res: RawResponse): Error {
    const detail = `${label} returned unexpected status ${res.status}: ${res.text.slice(0, 200)}`;
    return res.status >= 500 ? new ApiUnreachableError(detail) : new ApiProtocolError(detail);
  }
}
