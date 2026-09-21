import { DISCLAIMER } from "@nemea/shared-types";
import type { AlertRow } from "../repo.ts";

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const SEVERITY_MARK = { critical: "🔴", warning: "🟠", info: "🔵" } as const;
const SEVERITY_LABEL = { critical: "CRITICAL", warning: "WARNING", info: "INFO" } as const;
const TELEGRAM_LIMIT = 3800;
const SUMMARY_LIMIT = 700;

const KIND_HEADER: Record<string, { icon: string; label: string }> = {
  price_drop_1h: { icon: "📉", label: "Price drop, 1 hour" },
  price_drop_24h: { icon: "📉", label: "Price drop, 24 hours" },
  below_cost_basis: { icon: "🎯", label: "Below what you paid" },
  near_low: { icon: "🔻", label: "Near a low" },
  depeg: { icon: "⚖️", label: "Stablecoin off its peg" },
  stable_volume_anomaly: { icon: "🌊", label: "Stablecoin trading surge" },
  volume_spike: { icon: "📊", label: "Volume spike" },
  volume_dry_up: { icon: "🧊", label: "Trading slowed" },
  category_rotation: { icon: "🔄", label: "Category rotation" },
  portfolio_drop: { icon: "💼", label: "Portfolio drop" },
};

export function factIcon(label: string): string {
  const l = label.toLowerCase();
  if (/^price/.test(l)) return "💵";
  if (/cost basis/.test(l)) return "🎯";
  if (/^you hold/.test(l)) return "👛";
  if (/position value|value now|value 24h/.test(l)) return "💼";
  if (/volume/.test(l)) return "📊";
  if (/whole market|exposure/.test(l)) return "🌍";
  if (/^from /.test(l)) return "🧩";
  if (/\blow\b/.test(l) || /distance/.test(l)) return "🔻";
  if (/change|portfolio|below|drop/.test(l)) return "📉";
  return "▫️";
}

export function alertUrl(webOrigin: string, alertId: string): string {
  return `${webOrigin.replace(/\/$/, "")}/alerts/${alertId}`;
}

function cut(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}

export function telegramAlert(alert: AlertRow, webOrigin: string): { text: string; keyboard: Array<Array<{ text: string; url: string }>> | null } {
  const url = alertUrl(webOrigin, alert.id);
  const https = url.startsWith("https://");
  const kind = KIND_HEADER[alert.kind] ?? { icon: "🔔", label: "Alert" };
  const head = [`${SEVERITY_MARK[alert.severity]} <b>${SEVERITY_LABEL[alert.severity]}</b>  ·  ${kind.icon} ${escapeHtml(kind.label)}`];
  if (alert.simulated) head.push("🧪 <b>SIMULATION</b>  ·  the price move is made up for this demo");
  const factLines = alert.facts.map((f) => `${factIcon(f.label)} ${escapeHtml(f.label)}  <b>${escapeHtml(f.value)}</b>`);
  const tail: string[] = [];
  if (!https) tail.push(`Explain like I'm 5: ${escapeHtml(url)}`, "");
  tail.push(`<i>${escapeHtml(DISCLAIMER)}</i>`);
  const build = (facts: string[]) =>
    [...head, "", `<b>${escapeHtml(alert.title)}</b>`, "", `<blockquote>${escapeHtml(cut(alert.summary, SUMMARY_LIMIT))}</blockquote>`, "", ...facts, ...(facts.length > 0 ? [""] : []), ...tail].join("\n");
  let facts = factLines;
  let text = build(facts);
  while (text.length > TELEGRAM_LIMIT && facts.length > 0) {
    facts = facts.slice(0, -1);
    text = build(facts);
  }
  return { text, keyboard: https ? [[{ text: "Explain like I'm 5  →", url }]] : null };
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
