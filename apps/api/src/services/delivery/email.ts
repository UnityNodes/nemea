const TIMEOUT_MS = 12_000;

export type EmailSendResult = { ok: true } | { ok: false; reason: string };

export class EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(to: string, subject: string, html: string, text: string): Promise<EmailSendResult> {
    let res: Response;
    try {
      res = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ from: this.from, to: [to], subject, html, text }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      return { ok: false, reason: `network: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => "");
    return { ok: false, reason: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  }
}
