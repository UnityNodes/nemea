import webpush from "web-push";

export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };
export type PushSendResult = { ok: true } | { ok: false; reason: string; gone: boolean };

const PUSH_HOSTS: ReadonlyArray<RegExp> = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 5;
export const PUSH_DEADLINE_MS = 10_000;

export function isKnownPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.port === "" && url.username === "" && url.password === "" && PUSH_HOSTS.some((re) => re.test(url.hostname));
}

export class PushSender {
  readonly publicKey: string;

  constructor(publicKey: string, vapidSecret: string, subject: string) {
    webpush.setVapidDetails(subject, publicKey, vapidSecret);
    this.publicKey = publicKey;
  }

  async send(sub: PushSubscriptionRow, payload: string): Promise<PushSendResult> {
    if (!isKnownPushEndpoint(sub.endpoint)) return { ok: false, reason: "push endpoint is not a known push service", gone: true };
    const deadline = new Promise<PushSendResult>((resolve) => {
      setTimeout(() => resolve({ ok: false, reason: "push service did not answer in time", gone: false }), PUSH_DEADLINE_MS).unref();
    });
    const attempt = webpush
      .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600, timeout: PUSH_DEADLINE_MS })
      .then<PushSendResult>(() => ({ ok: true }))
      .catch<PushSendResult>((error) => {
        const status = (error as { statusCode?: number }).statusCode ?? 0;
        return { ok: false, reason: status ? `push service answered HTTP ${status}` : "push service unreachable", gone: status === 404 || status === 410 };
      });
    return Promise.race([attempt, deadline]);
  }
}
