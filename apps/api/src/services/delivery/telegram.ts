const TIMEOUT_MS = 10_000;

type TelegramBody = { ok?: boolean; description?: string; result?: { message_id?: number } };

export type TelegramSendResult = { ok: true; messageId: number } | { ok: false; reason: string; blocked: boolean };

export class TelegramSender {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(chatId: string, text: string, keyboard: Array<Array<{ text: string; url: string }>> | null): Promise<TelegramSendResult> {
    let res: Response;
    try {
      res = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      return { ok: false, reason: `network: ${error instanceof Error ? error.message : String(error)}`, blocked: false };
    }
    const body = await res.json().then(
      (v) => v as TelegramBody,
      () => null as TelegramBody | null,
    );
    if (res.ok && body?.ok && typeof body.result?.message_id === "number") return { ok: true, messageId: body.result.message_id };
    const blocked = res.status === 403 || (body?.description ?? "").toLowerCase().includes("chat not found");
    return { ok: false, reason: `HTTP ${res.status}: ${body?.description ?? "no description"}`, blocked };
  }
}
