import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CMC_API_KEY: z.string().min(8, "CMC_API_KEY is required"),
  CMC_BASE_URL: optionalString.pipe(z.string().url().optional()),
  DATABASE_URL: optionalString,
  PGLITE_DIR: z.string().default(".pglite"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters (openssl rand -hex 32)"),
  INTERNAL_API_SECRET: z.string().min(16, "INTERNAL_API_SECRET must be at least 16 characters"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_BOT_USERNAME: optionalString,
  ETHERSCAN_API_KEY: optionalString,
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  VAPID_PUBLIC_KEY: optionalString,
  VAPID_PRIVATE_KEY: optionalString,
  VAPID_SUBJECT: optionalString,
  POLLER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export type Config = z.infer<typeof EnvSchema>;

export type ConfigResult = { ok: true; config: Config } | { ok: false; problems: string[] };

export function loadConfig(env: Record<string, string | undefined>): ConfigResult {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`) };
  }
  const c = parsed.data;
  const problems: string[] = [];
  if (c.NODE_ENV === "production" && !c.DATABASE_URL) problems.push("DATABASE_URL: required in production (PGlite is for local development only)");
  if (c.RESEND_API_KEY && !c.EMAIL_FROM) problems.push("EMAIL_FROM: required when RESEND_API_KEY is set");
  const vapid = [c.VAPID_PUBLIC_KEY, c.VAPID_PRIVATE_KEY, c.VAPID_SUBJECT].filter(Boolean).length;
  if (vapid !== 0 && vapid !== 3) problems.push("VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be set together");
  if (c.TELEGRAM_BOT_TOKEN && !c.TELEGRAM_BOT_USERNAME) problems.push("TELEGRAM_BOT_USERNAME: required when TELEGRAM_BOT_TOKEN is set (used for the /start deep link)");
  return problems.length > 0 ? { ok: false, problems } : { ok: true, config: c };
}

export const PEGGED_USD_WATCHLIST: ReadonlyArray<{ cmcId: number; symbol: string }> = [
  { cmcId: 825, symbol: "USDT" },
  { cmcId: 3408, symbol: "USDC" },
  { cmcId: 4943, symbol: "DAI" },
  { cmcId: 29470, symbol: "USDE" },
];

export const SAMPLE_PORTFOLIO: ReadonlyArray<{ cmcId: number; amount: number; costBasisUsd: number | null }> = [
  { cmcId: 1, amount: 0.05, costBasisUsd: null },
  { cmcId: 1027, amount: 1.2, costBasisUsd: null },
  { cmcId: 5426, amount: 20, costBasisUsd: null },
  { cmcId: 3408, amount: 1500, costBasisUsd: null },
  { cmcId: 825, amount: 500, costBasisUsd: null },
];

export const MAX_QUOTE_AGE_MS = 30 * 60_000;
