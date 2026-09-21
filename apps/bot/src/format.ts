import { DISCLAIMER } from "@nemea/shared-types";
import type { LinkedSummary } from "./contract.ts";

export const MAX_MESSAGE_CHARS = 3800;
export const NOT_AVAILABLE = "n/a";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUsd(value: number | null): string {
  return value === null ? NOT_AVAILABLE : usd.format(value);
}

export function formatPct(value: number | null): string {
  if (value === null) return NOT_AVAILABLE;
  const fixed = value.toFixed(2);
  const rounded = Number(fixed);
  if (rounded === 0) return "0.00%";
  return `${rounded > 0 ? "+" : ""}${fixed}%`;
}

export function formatTime(iso: string | null): string {
  if (iso === null) return "none yet";
  const date = new Date(iso);
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function link(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}

export function helpMessage(): string {
  return [
    "<b>Nemea bot</b>",
    "/start <code>CODE</code> - link this chat to your Nemea account",
    "/status - portfolio and alert summary",
    "/stop - unlink this chat",
    "/help - show this message",
    "",
    "Nemea is non-custodial: I will never ask for your seed phrase or private keys.",
    "Not financial advice.",
  ].join("\n");
}

export function startInstructions(publicWebUrl: string | null): string {
  const dashboard = publicWebUrl === null ? "the Nemea dashboard" : link(publicWebUrl, "the Nemea dashboard");
  return [
    `1. Open ${dashboard} → Settings → Telegram → "Link".`,
    "2. Copy the code it shows.",
    "3. Send it here as <code>/start CODE</code>.",
    "",
    escapeHtml(DISCLAIMER),
  ].join("\n");
}

export function linkedMessage(username: string | null): string {
  const who = username === null ? "" : ` as @${escapeHtml(username)}`;
  return [
    `Linked${who}. This chat will now receive your Nemea alerts.`,
    "Send /status for a summary or /stop to unlink.",
  ].join("\n");
}

export function invalidCodeMessage(): string {
  return 'That code was not recognized. Copy it again from Settings → Telegram → "Link" in the dashboard.';
}

export function expiredCodeMessage(): string {
  return "That code has expired. Generate a new one in the dashboard and send it again.";
}

export function notLinkedMessage(): string {
  return "This chat is not linked to a Nemea account. Send /start for instructions.";
}

export function statusMessage(summary: LinkedSummary): string {
  return [
    "<b>Nemea status</b>",
    `Portfolio value: ${escapeHtml(formatUsd(summary.portfolioValueUsd))}`,
    `24h change: ${escapeHtml(formatPct(summary.change24hPct))}`,
    `Holdings: ${summary.holdings}`,
    `Alerts this week: ${summary.alertsThisWeek} of ${summary.weeklyCap}`,
    `Last alert: ${escapeHtml(formatTime(summary.lastAlertAt))}`,
    "",
    link(summary.dashboardUrl, "Open dashboard"),
  ].join("\n");
}

export function unlinkedMessage(wasLinked: boolean): string {
  return wasLinked
    ? "Unlinked. You will no longer get Nemea alerts in this chat. Send /start CODE to link again."
    : "This chat was not linked, so there is nothing to unlink.";
}

export function seedPhraseWarning(deleted: boolean): string {
  const handling = deleted
    ? "I deleted your message."
    : "I could not delete your message. Delete it yourself right now.";
  return [
    "<b>Never share your seed phrase.</b>",
    "Nemea will never ask for your seed phrase or private keys, and neither will anyone trustworthy.",
    handling,
    "If that was a real wallet phrase, treat it as exposed: create a new wallet and move your funds.",
  ].join("\n");
}

export function unknownMessage(): string {
  return "I only understand commands. Send /help to see them.";
}

export function unreachableMessage(): string {
  return "Nemea is unreachable right now, try again in a minute.";
}

export function badResponseMessage(): string {
  return "Nemea sent an answer I could not understand, try again in a minute.";
}

export function internalErrorMessage(): string {
  return "Something went wrong on my side, try again in a minute.";
}
