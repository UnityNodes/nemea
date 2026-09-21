import type { Repo, AlertRow, UserRow } from "../repo.ts";
import { emailContent, pushPayload, telegramAlert } from "./format.ts";
import type { EmailSender } from "./email.ts";
import type { PushSender } from "./push.ts";
import type { TelegramSender } from "./telegram.ts";

export type Senders = { telegram: TelegramSender | null; email: EmailSender | null; push: PushSender | null };

export class DeliveryService {
  constructor(
    private readonly repo: Repo,
    private readonly senders: Senders,
    private readonly webOrigin: string,
    private readonly log: (message: string, error?: unknown) => void = () => undefined,
    private readonly now: () => Date = () => new Date(),
    private readonly adminChatId: string | null = null,
  ) {}

  async notifyAdmin(text: string): Promise<boolean> {
    if (!this.adminChatId || !this.senders.telegram) return false;
    const res = await this.senders.telegram.send(this.adminChatId, text, null);
    if (!res.ok) this.log(`admin notification failed: ${res.reason}`);
    return res.ok;
  }

  channelsAvailable(): { telegram: boolean; email: boolean; push: boolean } {
    return { telegram: !!this.senders.telegram, email: !!this.senders.email, push: !!this.senders.push };
  }

  async deliver(user: UserRow, alert: AlertRow): Promise<void> {
    await Promise.all([this.viaTelegram(user, alert), this.viaPush(user, alert), this.viaEmailImmediate(user, alert)]);
  }

  private async viaTelegram(user: UserRow, alert: AlertRow): Promise<void> {
    if (!user.preferences.telegram || !user.telegramChatId) return;
    if (!this.senders.telegram) {
      await this.repo.recordDelivery(alert.id, user.id, "telegram", "skipped", "Telegram is not configured on this server");
      return;
    }
    try {
      const { text, keyboard } = telegramAlert(alert, this.webOrigin);
      const res = await this.senders.telegram.send(user.telegramChatId, text, keyboard);
      if (res.ok) {
        await this.repo.recordDelivery(alert.id, user.id, "telegram", "sent", `message ${res.messageId}`);
        return;
      }
      await this.repo.recordDelivery(alert.id, user.id, "telegram", "failed", res.reason);
      if (res.blocked) await this.repo.unlinkTelegram(user.id);
      this.log(`telegram delivery failed for alert ${alert.id}: ${res.reason}`);
    } catch (error) {
      await this.repo.recordDelivery(alert.id, user.id, "telegram", "failed", error instanceof Error ? error.message : String(error));
      this.log("telegram delivery threw", error);
    }
  }

  private async viaPush(user: UserRow, alert: AlertRow): Promise<void> {
    if (!user.preferences.push) return;
    const subs = await this.repo.pushOf(user.id);
    if (subs.length === 0) return;
    if (!this.senders.push) {
      await this.repo.recordDelivery(alert.id, user.id, "push", "skipped", "Web push is not configured on this server");
      return;
    }
    const payload = pushPayload(alert, this.webOrigin);
    for (const sub of subs) {
      try {
        const res = await this.senders.push.send(sub, payload);
        if (res.ok) {
          await this.repo.recordDelivery(alert.id, user.id, "push", "sent", "delivered to push service");
        } else {
          await this.repo.recordDelivery(alert.id, user.id, "push", "failed", res.reason);
          if (res.gone) await this.repo.deletePushEndpoint(sub.endpoint);
        }
      } catch (error) {
        await this.repo.recordDelivery(alert.id, user.id, "push", "failed", error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async viaEmailImmediate(user: UserRow, alert: AlertRow): Promise<void> {
    if (alert.severity !== "critical" || !user.preferences.email || !user.email || !user.emailVerified) return;
    await this.sendEmail(user, [alert], "critical");
  }

  private async sendEmail(user: UserRow, alerts: AlertRow[], mode: "digest" | "critical"): Promise<boolean> {
    if (!user.email) return false;
    if (!this.senders.email) {
      for (const a of alerts) await this.repo.recordDelivery(a.id, user.id, "email", "skipped", "Email is not configured on this server");
      return false;
    }
    try {
      const { subject, html, text } = emailContent(alerts, this.webOrigin, mode);
      const res = await this.senders.email.send(user.email, subject, html, text);
      for (const a of alerts) await this.repo.recordDelivery(a.id, user.id, "email", res.ok ? "sent" : "failed", res.ok ? mode : res.reason);
      if (!res.ok) this.log(`email ${mode} failed for user ${user.id}: ${res.reason}`);
      return res.ok;
    } catch (error) {
      this.log("email delivery threw", error);
      return false;
    }
  }

  async sendDigest(user: UserRow): Promise<"sent" | "nothing" | "failed"> {
    if (!user.preferences.email || !user.email || !user.emailVerified) return "nothing";
    const since = new Date(this.now().getTime() - 24 * 3600_000);
    const pending = await this.repo.emailPendingAlerts(user.id, since);
    if (pending.length === 0) return "nothing";
    const ok = await this.sendEmail(user, pending, "digest");
    if (ok) await this.repo.setLastDigest(user.id, this.now());
    return ok ? "sent" : "failed";
  }

  async runDigests(hourUtc: number, digestHourUtc: number): Promise<{ sent: number; failed: number }> {
    if (hourUtc !== digestHourUtc) return { sent: 0, failed: 0 };
    let sent = 0;
    let failed = 0;
    const today = this.now().toISOString().slice(0, 10);
    for (const user of await this.repo.allUsers()) {
      if (user.lastDigestAt && user.lastDigestAt.toISOString().slice(0, 10) === today) continue;
      const r = await this.sendDigest(user);
      if (r === "sent") sent += 1;
      if (r === "failed") failed += 1;
    }
    return { sent, failed };
  }
}
