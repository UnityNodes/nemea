import { readFileSync } from "node:fs";
import { ChainReadError } from "../src/index.ts";

export type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

export const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export function text(body: string, status = 200): Response {
  return new Response(body, { status });
}

export function fixture(name: string): any {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}

export function makeFetch(handler: Handler): { fetchImpl: typeof fetch; calls: { url: URL; init: RequestInit | undefined }[] } {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

export const hangingFetch = (async (_input: unknown, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  })) as unknown as typeof fetch;

export async function readError(promise: Promise<unknown>): Promise<ChainReadError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ChainReadError) return error;
    throw error;
  }
  throw new Error("expected a ChainReadError but the call resolved");
}
