import { isIP } from "node:net";
import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function parseBody<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new HttpError(400, "invalid_request", `${first?.path.join(".") || "body"}: ${first?.message ?? "invalid"}`);
  }
  return r.data;
}

export function errorHandler(log: (message: string, error: unknown) => void) {
  return (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof ZodError) {
      res.status(400).json({ error: { code: "invalid_request", message: error.issues[0]?.message ?? "invalid request" } });
      return;
    }
    const status = (error as { status?: number; statusCode?: number }).status ?? (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      res.status(status).json({ error: { code: "bad_request", message: "The request could not be read" } });
      return;
    }
    log("unhandled request error", error);
    res.status(500).json({ error: { code: "internal", message: "Something went wrong on our side" } });
  };
}

export function clientIp(req: Request): string {
  const header = req.app.get("client-ip-header") as string | null | undefined;
  if (header) {
    const raw = req.headers[header.toLowerCase()];
    const first = (Array.isArray(raw) ? raw[0] : raw)?.split(",")[0]?.trim();
    if (first && isIP(first) !== 0) return first;
  }
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

export class WindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((h) => h > t - this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.every((h) => h <= t - this.windowMs)) this.hits.delete(k);
    }
    return true;
  }
}
