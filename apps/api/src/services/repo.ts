import { randomUUID } from "node:crypto";
import { DEFAULT_PREFERENCES, type AlertPreferences, type Holding, type Chain } from "@nemea/shared-types";
import type { AlertContext, PastAlert } from "@nemea/alerts";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { alerts, deliveries, holdings, oneTimeTokens, pushSubscriptions, users } from "../db/schema.ts";

export type UserRow = typeof users.$inferSelect;
export type AlertRow = typeof alerts.$inferSelect;
export type HoldingRow = typeof holdings.$inferSelect;

export function toHolding(r: HoldingRow): Holding {
  return {
    id: r.id,
    cmcId: r.cmcId,
    symbol: r.symbol,
    name: r.name,
    amount: r.amount,
    costBasisUsd: r.costBasisUsd,
    source: r.source,
    chain: r.chain,
    contractAddress: r.contractAddress,
    walletAddress: r.walletAddress,
  };
}

export class Repo {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createUser(kind: "guest" | "wallet", walletAddress: string | null = null): Promise<UserRow> {
    const [row] = await this.db
      .insert(users)
      .values({ id: randomUUID(), kind, walletAddress: walletAddress?.toLowerCase() ?? null, preferences: { ...DEFAULT_PREFERENCES }, createdAt: this.now() })
      .returning();
    return row as UserRow;
  }

  async userById(id: string): Promise<UserRow | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    return row ?? null;
  }

  async userByWallet(address: string): Promise<UserRow | null> {
    const [row] = await this.db.select().from(users).where(eq(users.walletAddress, address.toLowerCase()));
    return row ?? null;
  }

  async userByTelegramChat(chatId: string): Promise<UserRow | null> {
    const [row] = await this.db.select().from(users).where(eq(users.telegramChatId, chatId));
    return row ?? null;
  }

  async allUsers(): Promise<UserRow[]> {
    return this.db.select().from(users);
  }

  async attachWallet(userId: string, address: string): Promise<void> {
    await this.db.update(users).set({ kind: "wallet", walletAddress: address.toLowerCase() }).where(eq(users.id, userId));
  }

  async setPreferences(userId: string, preferences: AlertPreferences): Promise<void> {
    await this.db.update(users).set({ preferences }).where(eq(users.id, userId));
  }

  async holdingsOf(userId: string): Promise<Holding[]> {
    const rows = await this.db.select().from(holdings).where(eq(holdings.userId, userId));
    return rows.map(toHolding);
  }

  async allHoldings(): Promise<Array<Holding & { userId: string }>> {
    const rows = await this.db.select().from(holdings);
    return rows.map((r) => ({ ...toHolding(r), userId: r.userId }));
  }

  async userIdsHolding(cmcIds: readonly number[]): Promise<string[]> {
    if (cmcIds.length === 0) return [];
    const rows = await this.db.selectDistinct({ userId: holdings.userId }).from(holdings).where(inArray(holdings.cmcId, [...cmcIds]));
    return rows.map((r) => r.userId);
  }

  async countHoldings(userId: string): Promise<number> {
    const [row] = await this.db.select({ n: sql<number>`count(*)::int` }).from(holdings).where(eq(holdings.userId, userId));
    return row?.n ?? 0;
  }

  async addHolding(userId: string, h: Omit<Holding, "id">): Promise<Holding> {
    const [row] = await this.db
      .insert(holdings)
      .values({ id: randomUUID(), userId, cmcId: h.cmcId, symbol: h.symbol, name: h.name, amount: h.amount, costBasisUsd: h.costBasisUsd, source: h.source, chain: h.chain, contractAddress: h.contractAddress, walletAddress: h.walletAddress, createdAt: this.now() })
      .returning();
    return toHolding(row as HoldingRow);
  }

  async updateHolding(userId: string, id: string, patch: { amount?: number; costBasisUsd?: number | null }): Promise<Holding | null> {
    const [row] = await this.db
      .update(holdings)
      .set({ ...(patch.amount !== undefined ? { amount: patch.amount } : {}), ...(patch.costBasisUsd !== undefined ? { costBasisUsd: patch.costBasisUsd } : {}) })
      .where(and(eq(holdings.id, id), eq(holdings.userId, userId)))
      .returning();
    return row ? toHolding(row) : null;
  }

  async findManualHolding(userId: string, cmcId: number): Promise<Holding | null> {
    const [row] = await this.db.select().from(holdings).where(and(eq(holdings.userId, userId), eq(holdings.cmcId, cmcId), eq(holdings.source, "manual")));
    return row ? toHolding(row) : null;
  }

  async deleteHolding(userId: string, id: string): Promise<boolean> {
    const rows = await this.db.delete(holdings).where(and(eq(holdings.id, id), eq(holdings.userId, userId))).returning({ id: holdings.id });
    return rows.length > 0;
  }

  async replaceWalletHoldings(userId: string, walletAddress: string, chains: readonly Chain[], items: ReadonlyArray<Omit<Holding, "id">>): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(holdings)
        .where(and(eq(holdings.userId, userId), eq(holdings.source, "wallet"), eq(holdings.walletAddress, walletAddress.toLowerCase()), inArray(holdings.chain, [...chains])));
      for (const h of items) {
        await tx.insert(holdings).values({ id: randomUUID(), userId, cmcId: h.cmcId, symbol: h.symbol, name: h.name, amount: h.amount, costBasisUsd: null, source: "wallet", chain: h.chain, contractAddress: h.contractAddress, walletAddress: walletAddress.toLowerCase(), createdAt: this.now() });
      }
    });
  }

  async insertAlert(userId: string, a: { kind: string; severity: "info" | "warning" | "critical"; cmcId: number | null; symbol: string | null; title: string; summary: string; facts: AlertRow["facts"]; context: AlertContext; dedupeKey: string; simulated: boolean }): Promise<AlertRow> {
    const [row] = await this.db.insert(alerts).values({ id: randomUUID(), userId, ...a, createdAt: this.now() }).returning();
    return row as AlertRow;
  }

  async alertById(userId: string, id: string): Promise<AlertRow | null> {
    const [row] = await this.db.select().from(alerts).where(and(eq(alerts.id, id), eq(alerts.userId, userId)));
    return row ?? null;
  }

  async alertsOf(userId: string, limit: number): Promise<AlertRow[]> {
    return this.db.select().from(alerts).where(eq(alerts.userId, userId)).orderBy(desc(alerts.createdAt)).limit(limit);
  }

  async markRead(userId: string, id: string | null): Promise<void> {
    const cond = id ? and(eq(alerts.userId, userId), eq(alerts.id, id), isNull(alerts.readAt)) : and(eq(alerts.userId, userId), isNull(alerts.readAt));
    await this.db.update(alerts).set({ readAt: this.now() }).where(cond);
  }

  async pastAlerts(userId: string, days: number): Promise<PastAlert[]> {
    const since = new Date(this.now().getTime() - days * 24 * 3600_000);
    const rows = await this.db.select().from(alerts).where(and(eq(alerts.userId, userId), gt(alerts.createdAt, since)));
    return rows.map((r) => ({ kind: r.kind as PastAlert["kind"], severity: r.severity, cmcId: r.cmcId, dedupeKey: r.dedupeKey, createdAt: r.createdAt.toISOString(), simulated: r.simulated }));
  }

  async alertsThisWeek(userId: string): Promise<{ count: number; lastAt: Date | null }> {
    const since = new Date(this.now().getTime() - 7 * 24 * 3600_000);
    const rows = await this.db.select({ at: alerts.createdAt }).from(alerts).where(and(eq(alerts.userId, userId), eq(alerts.simulated, false), gt(alerts.createdAt, since))).orderBy(desc(alerts.createdAt));
    return { count: rows.length, lastAt: rows[0]?.at ?? null };
  }

  async recordDelivery(alertId: string, userId: string, channel: "telegram" | "email" | "push", status: "sent" | "failed" | "skipped", detail: string): Promise<void> {
    await this.db.insert(deliveries).values({ id: randomUUID(), alertId, userId, channel, status, detail: detail.slice(0, 500), at: this.now() });
  }

  async deliveriesFor(alertIds: readonly string[]): Promise<Array<typeof deliveries.$inferSelect>> {
    if (alertIds.length === 0) return [];
    return this.db.select().from(deliveries).where(inArray(deliveries.alertId, [...alertIds]));
  }

  async emailPendingAlerts(userId: string, since: Date): Promise<AlertRow[]> {
    const rows = await this.db.select().from(alerts).where(and(eq(alerts.userId, userId), eq(alerts.simulated, false), gt(alerts.createdAt, since))).orderBy(desc(alerts.createdAt));
    if (rows.length === 0) return [];
    const done = await this.db.select({ alertId: deliveries.alertId }).from(deliveries).where(and(inArray(deliveries.alertId, rows.map((r) => r.id)), eq(deliveries.channel, "email"), eq(deliveries.status, "sent")));
    const sent = new Set(done.map((d) => d.alertId));
    return rows.filter((r) => !sent.has(r.id));
  }

  async setLastDigest(userId: string, at: Date): Promise<void> {
    await this.db.update(users).set({ lastDigestAt: at }).where(eq(users.id, userId));
  }

  async createToken(purpose: "telegram_link" | "email_verify" | "siwe_nonce", token: string, ttlMs: number, userId: string | null = null, payload: string | null = null): Promise<Date> {
    const expiresAt = new Date(this.now().getTime() + ttlMs);
    await this.db.insert(oneTimeTokens).values({ token, purpose, userId, payload, expiresAt });
    return expiresAt;
  }

  async consumeToken(purpose: "telegram_link" | "email_verify" | "siwe_nonce", token: string): Promise<{ status: "ok"; userId: string | null; payload: string | null } | { status: "invalid" | "expired" }> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(oneTimeTokens).where(and(eq(oneTimeTokens.token, token), eq(oneTimeTokens.purpose, purpose)));
      if (!row || row.usedAt) return { status: "invalid" as const };
      if (row.expiresAt.getTime() < this.now().getTime()) return { status: "expired" as const };
      const claimed = await tx.update(oneTimeTokens).set({ usedAt: this.now() }).where(and(eq(oneTimeTokens.token, token), isNull(oneTimeTokens.usedAt))).returning({ token: oneTimeTokens.token });
      if (claimed.length === 0) return { status: "invalid" as const };
      return { status: "ok" as const, userId: row.userId, payload: row.payload };
    });
  }

  async linkTelegram(userId: string, chatId: string, username: string | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ telegramChatId: null, telegramUsername: null }).where(eq(users.telegramChatId, chatId));
      await tx.update(users).set({ telegramChatId: chatId, telegramUsername: username }).where(eq(users.id, userId));
    });
  }

  async unlinkTelegram(userId: string): Promise<void> {
    await this.db.update(users).set({ telegramChatId: null, telegramUsername: null }).where(eq(users.id, userId));
  }

  async setEmail(userId: string, email: string | null, verified: boolean): Promise<void> {
    await this.db.update(users).set({ email, emailVerified: verified }).where(eq(users.id, userId));
  }

  async savePush(userId: string, sub: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
    await this.db.insert(pushSubscriptions).values({ ...sub, userId, createdAt: this.now() }).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.p256dh, auth: sub.auth } });
  }

  async pushOf(userId: string): Promise<Array<typeof pushSubscriptions.$inferSelect>> {
    return this.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }

  async deletePush(userId: string, endpoint: string | null): Promise<void> {
    await this.db.delete(pushSubscriptions).where(endpoint ? and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)) : eq(pushSubscriptions.userId, userId));
  }

  async deletePushEndpoint(endpoint: string): Promise<void> {
    await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }
}
