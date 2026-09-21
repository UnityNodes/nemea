import type { AlertFact, AlertPreferences, CategorySnapshot, GlobalMetricsSnapshot, QuoteSnapshot, TokenMeta } from "@nemea/shared-types";
import type { AlertContext, PriceLow } from "@nemea/alerts";
import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<"guest" | "wallet">().notNull(),
    walletAddress: text("wallet_address"),
    preferences: jsonb("preferences").$type<AlertPreferences>().notNull(),
    email: text("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    telegramChatId: text("telegram_chat_id"),
    telegramUsername: text("telegram_username"),
    lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_wallet_idx").on(t.walletAddress), uniqueIndex("users_telegram_idx").on(t.telegramChatId)],
);

export const holdings = pgTable(
  "holdings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    cmcId: integer("cmc_id").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    amount: doublePrecision("amount").notNull(),
    costBasisUsd: doublePrecision("cost_basis_usd"),
    source: text("source").$type<"manual" | "wallet">().notNull(),
    chain: text("chain").$type<"ethereum" | "base" | "arbitrum">(),
    contractAddress: text("contract_address"),
    walletAddress: text("wallet_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("holdings_user_idx").on(t.userId), index("holdings_cmc_idx").on(t.cmcId)],
);

export const tokenMeta = pgTable("token_meta", {
  cmcId: integer("cmc_id").primaryKey(),
  data: jsonb("data").$type<TokenMeta>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

export const quoteLatest = pgTable("quote_latest", {
  cmcId: integer("cmc_id").primaryKey(),
  data: jsonb("data").$type<QuoteSnapshot>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

export const marketSnapshots = pgTable("market_snapshots", {
  key: text("key").primaryKey(),
  data: jsonb("data").$type<GlobalMetricsSnapshot | CategorySnapshot[]>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

export const priceLows = pgTable("price_lows", {
  cmcId: integer("cmc_id").primaryKey(),
  data: jsonb("data").$type<PriceLow | null>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

export const alerts = pgTable(
  "alerts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    severity: text("severity").$type<"info" | "warning" | "critical">().notNull(),
    cmcId: integer("cmc_id"),
    symbol: text("symbol"),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    facts: jsonb("facts").$type<AlertFact[]>().notNull(),
    context: jsonb("context").$type<AlertContext>().notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    simulated: boolean("simulated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [index("alerts_user_created_idx").on(t.userId, t.createdAt)],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    alertId: text("alert_id").notNull().references(() => alerts.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").$type<"telegram" | "email" | "push">().notNull(),
    status: text("status").$type<"sent" | "failed" | "skipped">().notNull(),
    detail: text("detail").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deliveries_alert_idx").on(t.alertId), index("deliveries_user_channel_idx").on(t.userId, t.channel, t.at)],
);

export const oneTimeTokens = pgTable("one_time_tokens", {
  token: text("token").primaryKey(),
  purpose: text("purpose").$type<"telegram_link" | "email_verify" | "siwe_nonce">().notNull(),
  userId: text("user_id"),
  payload: text("payload"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pollState = pgTable("poll_state", {
  lane: text("lane").primaryKey(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastError: text("last_error"),
  itemCount: integer("item_count").notNull().default(0),
});
