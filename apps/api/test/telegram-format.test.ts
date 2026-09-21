import { describe, expect, it } from "vitest";
import { factIcon, telegramAlert } from "../src/services/delivery/format.ts";
import type { AlertRow } from "../src/services/repo.ts";

function alert(over: Partial<AlertRow> = {}): AlertRow {
  return {
    id: "a1",
    userId: "u1",
    kind: "price_drop_24h",
    severity: "warning",
    cmcId: 1,
    symbol: "BTC",
    title: "BTC is down 23% in the last 24 hours",
    summary: "Bitcoin moved from about $84,000 to $65,000. Nothing has happened to your coins — this is the market price only.",
    facts: [
      { label: "Price now", value: "$65,082" },
      { label: "Change, 24h", value: "-23%" },
      { label: "You hold", value: "0.05 BTC" },
      { label: "Position value", value: "$3,254 (28% of portfolio)" },
    ],
    context: { cmcId: 1, observed: {}, categoryName: null, categoryChange24hPct: null, marketChange24hPct: null, attribution: null },
    dedupeKey: "price_drop:1",
    simulated: false,
    createdAt: new Date(),
    readAt: null,
    ...over,
  } as AlertRow;
}

describe("telegram alert message", () => {
  it("has a severity and kind header, a bold title, a quoted explanation, icon-led facts and the disclaimer", () => {
    const { text, keyboard } = telegramAlert(alert(), "https://nemea.test");
    const lines = text.split("\n");
    expect(lines[0]).toBe("🟠 <b>WARNING</b>  ·  📉 Price drop, 24 hours");
    expect(text).toContain("<b>BTC is down 23% in the last 24 hours</b>");
    expect(text).toContain("<blockquote>Bitcoin moved from about $84,000");
    expect(text).toContain("💵 Price now  <b>$65,082</b>");
    expect(text).toContain("👛 You hold  <b>0.05 BTC</b>");
    expect(text).toContain("💼 Position value  <b>$3,254 (28% of portfolio)</b>");
    expect(text).toContain("<i>Not financial advice.");
    expect(text).not.toContain("SIMULATION");
    expect(keyboard).toEqual([[{ text: "Explain like I'm 5  →", url: "https://nemea.test/alerts/a1" }]]);
  });

  it("marks a simulation on its own line so it cannot be mistaken for a real move", () => {
    const { text } = telegramAlert(alert({ simulated: true }), "https://nemea.test");
    expect(text.split("\n")[1]).toBe("🧪 <b>SIMULATION</b>  ·  the price move is made up for this demo");
  });

  it("falls back to a plain link in the text when the web origin is not https, because Telegram rejects such buttons", () => {
    const { text, keyboard } = telegramAlert(alert(), "http://localhost:3300");
    expect(keyboard).toBeNull();
    expect(text).toContain("Explain like I'm 5: http://localhost:3300/alerts/a1");
  });

  it("escapes anything that could break the HTML, in every field", () => {
    const { text } = telegramAlert(alert({ title: "<b>x</b> & y", summary: "a < b > c & d", facts: [{ label: "L<", value: "<script>" }] }), "https://nemea.test");
    expect(text).not.toContain("<script>");
    expect(text).toContain("&lt;b&gt;x&lt;/b&gt; &amp; y");
    expect(text).toContain("a &lt; b &gt; c &amp; d");
    expect(text).toContain("L&lt;  <b>&lt;script&gt;</b>");
  });

  it("stays under Telegram's limit by dropping facts from the end, never by cutting a tag in half", () => {
    const facts = Array.from({ length: 200 }, (_, i) => ({ label: `Fact number ${i}`, value: "x".repeat(60) }));
    const { text } = telegramAlert(alert({ facts, summary: "s".repeat(5000) }), "https://nemea.test");
    expect(text.length).toBeLessThanOrEqual(3800);
    const opens = (text.match(/<b>/g) ?? []).length;
    const closes = (text.match(/<\/b>/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(text.match(/<blockquote>/g)).toHaveLength(1);
    expect(text.match(/<\/blockquote>/g)).toHaveLength(1);
    expect(text).toContain("Not financial advice");
  });

  it("gives every alert kind a header and never prints undefined", () => {
    for (const kind of ["price_drop_1h", "price_drop_24h", "below_cost_basis", "near_low", "depeg", "stable_volume_anomaly", "volume_spike", "volume_dry_up", "category_rotation", "portfolio_drop"]) {
      const { text } = telegramAlert(alert({ kind }), "https://nemea.test");
      expect(text.split("\n")[0], kind).toMatch(/^(🔴|🟠|🔵) <b>[A-Z]+<\/b>  ·  \S+ .+/);
      expect(text).not.toMatch(/undefined|null/);
    }
    expect(telegramAlert(alert({ kind: "something_new" }), "https://nemea.test").text.split("\n")[0]).toContain("🔔 Alert");
  });

  it("picks an icon for each kind of fact", () => {
    expect(factIcon("Price now")).toBe("💵");
    expect(factIcon("Change, 24h")).toBe("📉");
    expect(factIcon("Your cost basis")).toBe("🎯");
    expect(factIcon("24h volume vs previous 24h")).toBe("📊");
    expect(factIcon("Whole market, 24h")).toBe("🌍");
    expect(factIcon("From Layer 1")).toBe("🧩");
    expect(factIcon("365-day low")).toBe("🔻");
    expect(factIcon("Something else")).toBe("▫️");
  });
});
