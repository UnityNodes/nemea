import webpush from "web-push";

export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };
export type PushSendResult = { ok: true } | { ok: false; reason: string; gone: boolean };

export class PushSender {
  readonly publicKey: string;

  constructor(publicKey: string, privateKey: string, subject: string) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.publicKey = publicKey;
  }

  async send(sub: PushSubscriptionRow, payload: string): Promise<PushSendResult> {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600, timeout: 10_000 });
      return { ok: true };
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode ?? 0;
      return { ok: false, reason: `push HTTP ${status || "error"}: ${error instanceof Error ? error.message : String(error)}`, gone: status === 404 || status === 410 };
    }
  }
}
