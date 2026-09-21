import { DISCLAIMER } from "@nemea/shared-types";
import type { AlertRow } from "../repo.ts";

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const SEVERITY_MARK = { critical: "🔴", warning: "🟠", info: "🔵" } as const;
const TELEGRAM_LIMIT = 3800;

export function alertUrl(webOrigin: string, alertId: string): string {
  return `${webOrigin.replace(/\/$/, "")}/alerts/${alertId}`;
}

export function telegramAlert(alert: AlertRow, webOrigin: string): { text: string; keyboard: Array<Array<{ text: string; url: string }>> | null } {
  const url = alertUrl(webOrigin, alert.id);
  const https = url.startsWith("https://");
  const lines = [
    `${SEVERITY_MARK[alert.severity]} <b>${alert.simulated ? "[SIMULATION] " : ""}${escapeHtml(alert.title)}</b>`,
    "",
    escapeHtml(alert.summary),
    "",
    ...alert.facts.map((f) => `• ${escapeHtml(f.label)}: <b>${escapeHtml(f.value)}</b>`),
    "",
    `<i>${escapeHtml(DISCLAIMER)}</i>`,
  ];
  if (!https) lines.push("", `Explain like I'm 5: ${escapeHtml(url)}`);
  let text = lines.join("\n");
  if (text.length > TELEGRAM_LIMIT) text = `${text.slice(0, TELEGRAM_LIMIT - 1)}…`;
  return { text, keyboard: https ? [[{ text: "Explain like I'm 5", url }]] : null };
}

export function pushPayload(alert: AlertRow, webOrigin: string): string {
  return JSON.stringify({
    title: `${alert.simulated ? "[SIMULATION] " : ""}${alert.title}`,
    body: alert.summary.length > 140 ? `${alert.summary.slice(0, 137)}…` : alert.summary,
    url: alertUrl(webOrigin, alert.id),
    tag: alert.id,
  });
}

export function emailContent(alerts: readonly AlertRow[], webOrigin: string, mode: "digest" | "critical"): { subject: string; html: string; text: string } {
  const subject = mode === "critical" ? `Nemea: ${alerts[0]?.title ?? "important alert"}` : `Nemea digest: ${alerts.length} ${alerts.length === 1 ? "alert" : "alerts"} to look at`;
  const blocks = alerts.map((a) => {
    const url = alertUrl(webOrigin, a.id);
    return {
      html: `<div style="margin:0 0 20px"><p style="margin:0 0 4px;font-size:16px"><b>${SEVERITY_MARK[a.severity]} ${escapeHtml(a.title)}</b></p><p style="margin:0 0 6px;color:#333">${escapeHtml(a.summary)}</p><ul style="margin:0 0 6px;padding-left:18px;color:#333">${a.facts.map((f) => `<li>${escapeHtml(f.label)}: <b>${escapeHtml(f.value)}</b></li>`).join("")}</ul><p style="margin:0"><a href="${escapeHtml(url)}">Explain like I'm 5</a></p></div>`,
      text: [`${a.title}`, a.summary, ...a.facts.map((f) => `- ${f.label}: ${f.value}`), `Explain like I'm 5: ${url}`].join("\n"),
    };
  });
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">${blocks.map((b) => b.html).join("")}<p style="color:#666;font-size:12px">${escapeHtml(DISCLAIMER)}</p></div>`;
  const text = `${blocks.map((b) => b.text).join("\n\n")}\n\n${DISCLAIMER}`;
  return { subject, html, text };
}
