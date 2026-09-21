export const DEFAULT_PORT = 4100;

export type BotConfig = {
  token: string;
  apiOrigin: string;
  internalSecret: string;
  publicWebUrl: string | null;
  port: number;
};

export type ConfigResult =
  | { ok: true; config: BotConfig }
  | { ok: false; missing: string[]; invalid: string[] };

type Env = Record<string, string | undefined>;

const REQUIRED = ["TELEGRAM_BOT_TOKEN", "API_ORIGIN", "INTERNAL_API_SECRET"] as const;

function read(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value === undefined || value === "" ? null : value;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function readConfig(env: Env): ConfigResult {
  const missing = REQUIRED.filter((name) => read(env, name) === null);
  const invalid: string[] = [];

  const apiOrigin = read(env, "API_ORIGIN");
  if (apiOrigin !== null && !isHttpUrl(apiOrigin)) invalid.push("API_ORIGIN must be an http(s) URL");

  const publicWebUrl = read(env, "PUBLIC_WEB_URL");
  if (publicWebUrl !== null && !isHttpUrl(publicWebUrl)) invalid.push("PUBLIC_WEB_URL must be an http(s) URL");

  const rawPort = read(env, "PORT");
  let port = DEFAULT_PORT;
  if (rawPort !== null) {
    port = Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) invalid.push("PORT must be an integer from 1 to 65535");
  }

  const token = read(env, "TELEGRAM_BOT_TOKEN");
  const internalSecret = read(env, "INTERNAL_API_SECRET");
  if (missing.length > 0 || invalid.length > 0 || token === null || apiOrigin === null || internalSecret === null) {
    return { ok: false, missing: [...missing], invalid };
  }
  return { ok: true, config: { token, apiOrigin, internalSecret, publicWebUrl, port } };
}
