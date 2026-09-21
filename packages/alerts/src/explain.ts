import type { AlertFact, AlertKind, Explanation, ExplainSection, QuoteSnapshot, Severity } from "@nemea/shared-types";
import { pct, pctAbs, usd } from "./format.ts";
import type { PegSummary } from "./similar-drops.ts";
import type { AlertContext, SimilarDropsSummary } from "./types.ts";

export type ExplainAlert = {
  kind: AlertKind;
  severity: Severity;
  symbol: string | null;
  title: string;
  facts: AlertFact[];
  context: AlertContext;
};

export type ExplainInput = {
  alert: ExplainAlert;
  name: string | null;
  quoteNow: QuoteSnapshot | null;
  similarDrops: SimilarDropsSummary | null;
  pegHistory: PegSummary | null;
  historyUnavailableReason: string | null;
};

export const CALM_NOTE =
  "Nothing has been sold, moved or changed in your wallet. Nemea only watches prices, so an alert is like a smoke detector: it tells you to look, not that the house is on fire. You decide what, if anything, to do.";

function num(value: number | string | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function sinceAlert(input: ExplainInput, priceAtAlert: number | null): ExplainSection | null {
  const now = input.quoteNow?.priceUsd ?? null;
  if (now === null || priceAtAlert === null || priceAtAlert <= 0) return null;
  const move = (now / priceAtAlert - 1) * 100;
  if (Math.abs(move) < 0.5) return { heading: "Since the alert", body: `The price is about the same as when we alerted you (${usd(now)}).` };
  return {
    heading: "Since the alert",
    body: `The price when we alerted you was ${usd(priceAtAlert)}. Right now CoinMarketCap shows ${usd(now)}, which is ${pct(move)} from then.`,
  };
}

function dropHistory(input: ExplainInput, symbol: string, thresholdPct: number): { section: ExplainSection | null; gap: string | null } {
  const s = input.similarDrops;
  if (!s) {
    return { section: null, gap: input.historyUnavailableReason ?? "Price history was not available, so we cannot say whether this has happened before." };
  }
  const t = Math.round(thresholdPct);
  if (s.events.length === 0) {
    return {
      section: {
        heading: "Has this happened before?",
        body: `We checked about ${s.windowDays} days of daily closing prices from CoinMarketCap. ${symbol} did not have a one-day fall of ${t}% or more in that time, so a drop like this is unusual for it. That is a reason to look at what is going on, not a reason to panic.`,
      },
      gap: null,
    };
  }
  const n = s.events.length;
  const rec = s.recoveredCount;
  let recovery = "";
  if (rec > 0 && s.medianRecoveryDays !== null) {
    recovery = ` In ${rec} of them the price climbed back to where it started; the typical wait was about ${s.medianRecoveryDays} ${plural(Math.round(s.medianRecoveryDays), "day", "days")}.`;
  }
  const still = s.notRecoveredCount > 0 ? ` ${s.notRecoveredCount} ${plural(s.notRecoveredCount, "time", "times")} it had not got back to that level by the end of the data.` : "";
  return {
    section: {
      heading: "Has this happened before?",
      body: `Looking at about ${s.windowDays} days of daily closing prices from CoinMarketCap, ${symbol} fell ${t}% or more in a day ${n} ${plural(n, "time", "times")}.${recovery}${still} Past behaviour does not predict what happens next.`,
    },
    gap: null,
  };
}

function wherePriceDropCame(c: AlertContext, symbol: string, name: string): ExplainSection {
  const coin = num(c.observed.change24hPct);
  const market = c.marketChange24hPct;
  const cat = c.categoryChange24hPct;
  if (coin !== null && market !== null && market <= -3 && coin - market > -6) {
    return {
      heading: "Is it just this coin, or everyone?",
      body: `Everyone. The whole crypto market is ${pct(market)} over 24 hours (CoinMarketCap global data), and ${symbol} is ${pct(coin)}. When most coins fall together, the cause is usually the general mood of the market rather than something wrong with one coin.`,
    };
  }
  if (coin !== null && cat !== null && c.categoryName && cat <= -3 && coin - cat > -6) {
    return {
      heading: "Is it just this coin, or everyone?",
      body: `It is a neighbourhood move. Coins in the "${c.categoryName}" group are ${pct(cat)} on average today, and ${symbol} is ${pct(coin)}${market !== null ? `, while the whole market is ${pct(market)}` : ""}. Groups of similar coins often move together when money shifts from one theme to another.`,
    };
  }
  if (coin !== null && market !== null && coin - market <= -8) {
    return {
      heading: "Is it just this coin, or everyone?",
      body: `It fell much more than the market. The whole market is ${pct(market)}, ${symbol} is ${pct(coin)}. A gap this big often points to something specific to ${name}, such as news, a change in the project, or a big holder selling. We cannot see the news, so we will not guess. The project's official channels are the place to check.`,
    };
  }
  if (market === null) {
    return { heading: "Is it just this coin, or everyone?", body: "We could not load market-wide numbers just now, so we cannot compare this move with the rest of the market." };
  }
  return {
    heading: "Is it just this coin, or everyone?",
    body: `Partly the market. The whole market is ${pct(market)} and ${symbol} is ${coin !== null ? pct(coin) : "down"}: some of the move is shared, some is specific to ${name}.`,
  };
}

function whatPeopleDo(mentionSwap: boolean): ExplainSection {
  return {
    heading: "What do people usually do?",
    body:
      "There is no single right answer, and this is not advice. Some holders do nothing because they bought for the long term. Some re-check why they bought in the first place. Some decide in advance how big a loss they can live with, so that a fast market does not decide for them." +
      (mentionSwap ? " If you have turned on protective suggestions, Nemea can prepare a swap link. You review and approve everything in your own wallet." : ""),
  };
}

function priceDrop(input: ExplainInput): Explanation {
  const { alert } = input;
  const c = alert.context;
  const symbol = alert.symbol ?? "This coin";
  const name = input.name ?? symbol;
  const isHour = alert.kind === "price_drop_1h";
  const change = num(isHour ? c.observed.change1hPct : c.observed.change24hPct) ?? 0;
  const price = num(c.observed.priceUsd);
  const thresholdPct = num(c.observed.thresholdPct) ?? Math.abs(change);
  const sections: ExplainSection[] = [];
  const gaps: string[] = [];
  const window = isHour ? "the last hour" : "the last 24 hours";
  sections.push({
    heading: "What happened, in plain words",
    body: `A coin's price is simply what buyers and sellers agree on at each moment. In ${window} the price of ${name} slid ${pctAbs(change)}${price !== null ? `, to about ${usd(price)}` : ""}. Think of a price tag in a shop being marked down by ${pctAbs(change)}: the thing itself is the same, only what people will pay for it right now has changed.`,
  });
  sections.push(wherePriceDropCame(c, symbol, name));
  const history = dropHistory(input, symbol, Math.max(5, Math.abs(change) * 0.7));
  if (history.section) sections.push(history.section);
  if (history.gap) gaps.push(history.gap);
  const since = sinceAlert(input, price);
  if (since) sections.push(since);
  sections.push(whatPeopleDo(true));
  return {
    headline: `${symbol} dropped ${pctAbs(change)}${isHour ? " in an hour" : " in a day"} — here is what that means`,
    sections,
    calmNote: CALM_NOTE,
    dataGaps: gaps,
  };
}

function depeg(input: ExplainInput): Explanation {
  const { alert } = input;
  const c = alert.context;
  const symbol = alert.symbol ?? "This stablecoin";
  const price = num(c.observed.priceUsd);
  const off = num(c.observed.offPegPct);
  const volume = num(c.observed.volumeChange24hPct);
  const sections: ExplainSection[] = [
    {
      heading: "What is a stablecoin?",
      body: `A stablecoin is a coin built to stay worth $1, a bit like a gift card with a fixed value. ${symbol} is trading at ${price !== null ? usd(price) : "below $1"} right now${off !== null ? `, ${pctAbs(off)} under its target` : ""}.`,
    },
    {
      heading: "Why can this happen?",
      body: "Small wobbles, well under 1%, are common when many people trade at once. A bigger gap can mean traders doubt that the issuer holds enough reserves, or that there is a technical problem. Price data alone cannot tell which one it is.",
    },
  ];
  if (volume !== null) {
    sections.push({
      heading: "How busy is trading?",
      body: volume >= 100 ? `Trading volume is ${pct(volume, 0)} versus the day before, so a lot of people are moving at the same time.` : `Trading volume is ${pct(volume, 0)} versus the day before.`,
    });
  }
  const gaps: string[] = [];
  const peg = input.pegHistory;
  if (peg) {
    const floor = usd(peg.floorUsd);
    sections.push({
      heading: "Has this happened before?",
      body:
        peg.episodes === 0
          ? `In about ${peg.windowDays} days of daily closing prices from CoinMarketCap, ${symbol} never closed below ${floor}. That makes today unusual.`
          : `In about ${peg.windowDays} days of daily closes from CoinMarketCap, ${symbol} closed below ${floor} in ${peg.episodes} separate ${plural(peg.episodes, "stretch", "stretches")}${peg.medianDaysBelow !== null ? `; the typical stretch lasted about ${peg.medianDaysBelow} ${plural(Math.round(peg.medianDaysBelow), "day", "days")}` : ""}${peg.longestDaysBelow !== null ? `, the longest ${peg.longestDaysBelow} ${plural(peg.longestDaysBelow, "day", "days")}` : ""}${peg.lowestCloseUsd !== null ? `. The lowest close was ${usd(peg.lowestCloseUsd)}` : ""}.${peg.stillBelow ? " It is still below that level at the end of the data." : ""} Past behaviour does not predict what happens next.`,
    });
  } else {
    gaps.push(input.historyUnavailableReason ?? "Price history was not available, so we cannot say how often this stablecoin has slipped before.");
  }
  const since = sinceAlert(input, price);
  if (since) sections.push(since);
  sections.push(whatPeopleDo(true));
  return { headline: `${symbol} slipped below $1 — here is what that means`, sections, calmNote: CALM_NOTE, dataGaps: gaps };
}

function costBasis(input: ExplainInput): Explanation {
  const c = input.alert.context;
  const symbol = input.alert.symbol ?? "This coin";
  const basis = num(c.observed.costBasisUsd);
  const price = num(c.observed.priceUsd);
  const below = num(c.observed.belowPct);
  const sections: ExplainSection[] = [
    {
      heading: "What is a cost basis?",
      body: `It is what you paid per coin${basis !== null ? ` (${usd(basis)} for ${symbol}, as you entered it)` : ""}. It is your personal break-even line.`,
    },
    {
      heading: "What does it mean to be below it?",
      body: `${price !== null ? `${symbol} is now ${usd(price)}${below !== null ? `, ${pctAbs(below)} under your entry` : ""}. ` : ""}That is a loss on paper. It only becomes a real loss if you sell at that price. Many holders treat a break-even line as a moment to re-check their plan, not as an alarm.`,
    },
  ];
  const since = sinceAlert(input, price);
  if (since) sections.push(since);
  sections.push(whatPeopleDo(true));
  return { headline: `${symbol} moved below what you paid — what that means`, sections, calmNote: CALM_NOTE, dataGaps: [] };
}

function nearLow(input: ExplainInput): Explanation {
  const c = input.alert.context;
  const symbol = input.alert.symbol ?? "This coin";
  const price = num(c.observed.priceUsd);
  const low = num(c.observed.lowUsd);
  const scope = c.observed.lowScope;
  const days = num(c.observed.lowWindowDays);
  const label = scope === "all_time" ? "all-time low" : `${days ?? "N"}-day low`;
  const sections: ExplainSection[] = [
    {
      heading: "What is a low?",
      body:
        scope === "all_time"
          ? `The all-time low is the cheapest price CoinMarketCap has ever recorded for ${symbol}${low !== null ? ` (${usd(low)})` : ""}.`
          : `We could only compare against the last ${days ?? "several"} days of prices, so this is the lowest price in that window${low !== null ? ` (${usd(low)})` : ""}, not the all-time low.`,
    },
    {
      heading: "What does being near it mean?",
      body: `${price !== null ? `${symbol} is at ${usd(price)}. ` : ""}That places it near the bottom of its ${label} range. It does not say whether the price will go lower or bounce, it only tells you where you are on the map.`,
    },
  ];
  const gaps = scope === "window" ? ["All-time low data needs a higher CoinMarketCap plan, so Nemea used the longest window of price history it can read."] : [];
  const since = sinceAlert(input, price);
  if (since) sections.push(since);
  sections.push(whatPeopleDo(true));
  return { headline: `${symbol} is close to its ${label}`, sections, calmNote: CALM_NOTE, dataGaps: gaps };
}

function volume(input: ExplainInput): Explanation {
  const c = input.alert.context;
  const symbol = input.alert.symbol ?? "This coin";
  const vol = num(c.observed.volumeChange24hPct);
  const change = num(c.observed.change24hPct);
  const stable = input.alert.kind === "stable_volume_anomaly";
  const dry = input.alert.kind === "volume_dry_up";
  const sections: ExplainSection[] = [
    {
      heading: "What is trading volume?",
      body: "Volume is how much of a coin changed hands in the last 24 hours. Picture the noise level in a market hall: busy means many people are buying and selling, quiet means few are.",
    },
  ];
  if (dry) {
    sections.push({
      heading: "Why does a quiet market matter?",
      body: `Volume for ${symbol} is ${vol !== null ? pctAbs(vol) : "much"} lower than the day before${change !== null ? ` while the price is ${pct(change)}` : ""}. When few people are trading, even modest orders can push the price around, so moves can be bigger and sales can be harder to make at a fair price. CoinMarketCap gives us volume, not order books, so we treat this as a hint about thin liquidity, not proof.`,
    });
  } else {
    sections.push({
      heading: "Why does a busy market matter?",
      body: `Volume for ${symbol} is ${vol !== null ? `${pct(vol, 0)}` : "far"} above the previous day. ${stable ? "For a stablecoin that usually means many people are moving money in or out at once, which is normal in a shaky market and worth watching if the price also slips below $1." : `${change !== null && change <= -5 ? "The price is falling at the same time, which can mean many people are selling. " : ""}A burst of activity means something is drawing attention: news, a launch, or fear. It says nothing about which way the price goes next.`}`,
    });
  }
  sections.push(whatPeopleDo(false));
  return {
    headline: dry ? `${symbol}: the market got very quiet` : `${symbol}: unusually busy trading`,
    sections,
    calmNote: CALM_NOTE,
    dataGaps: dry ? ["CoinMarketCap's basic data has no order-book depth, so volume is used as a stand-in for liquidity."] : [],
  };
}

function category(input: ExplainInput): Explanation {
  const c = input.alert.context;
  const cat = c.categoryName ?? "a group of coins";
  const change = c.categoryChange24hPct;
  const market = c.marketChange24hPct;
  const share = num(c.observed.exposureShare);
  const sections: ExplainSection[] = [
    {
      heading: "What is a category?",
      body: `CoinMarketCap sorts coins into groups of similar projects, for example lending apps, or coins that run their own blockchain. "${cat}" is one of those groups.`,
    },
    {
      heading: "What is a rotation?",
      body: `${change !== null ? `Coins in this group are ${pct(change)} on average today` : "Coins in this group are down today"}${market !== null ? `, while the whole market is ${pct(market)}` : ""}. When one group falls much harder than the market, it often means traders are moving money out of that theme and into something else. That is called a rotation.`,
    },
  ];
  if (share !== null) sections.push({ heading: "Why are you seeing this?", body: `About ${(share * 100).toFixed(0)}% of your portfolio sits in this group, so a move here shows up in your total.` });
  sections.push(whatPeopleDo(true));
  return { headline: `${cat} is falling faster than the market`, sections, calmNote: CALM_NOTE, dataGaps: market === null ? ["Whole-market numbers were unavailable."] : [] };
}

function portfolio(input: ExplainInput): Explanation {
  const c = input.alert.context;
  const a = c.attribution;
  const change = num(c.observed.change24hPct) ?? a?.portfolioChange24hPct ?? 0;
  const market = c.marketChange24hPct;
  const top = a?.byCategory[0];
  const sections: ExplainSection[] = [
    {
      heading: "What happened, in plain words",
      body: `Nemea adds up what every coin you told us about is worth right now and compares it with 24 hours ago. That total is ${pct(change)}${a ? `, about ${usd(a.lossUsd)} less than a day ago` : ""}.`,
    },
  ];
  if (a && a.byCategory.length > 0) {
    const lines = a.byCategory.slice(0, 4).map((g) => `${g.categoryName} (${g.symbols.join(", ")}): ${g.sharePct.toFixed(0)}% of the drop${g.categoryChange24hPct !== null ? `, and the whole group is ${pct(g.categoryChange24hPct)} on average` : ""}`);
    sections.push({ heading: "Where the drop came from", body: lines.join(". ") + "." });
  }
  if (market !== null) {
    const rel = change - market;
    sections.push({
      heading: "Compared with the whole market",
      body:
        rel <= -5
          ? `The whole crypto market is ${pct(market)} over the same time, so your portfolio fell more than the market. That usually means the coins you hold are more exposed to the sold-off group than the average coin is.`
          : `The whole crypto market is ${pct(market)} over the same time, so most of this is the market moving as a whole rather than your particular picks.`,
    });
  }
  sections.push(whatPeopleDo(true));
  const headline =
    top && top.categoryChange24hPct !== null && top.sharePct >= 50
      ? `Your portfolio dropped ${pctAbs(change)} because ${top.categoryName} is down ${pctAbs(top.categoryChange24hPct)} across the market`
      : `Your portfolio dropped ${pctAbs(change)} — here is where it came from`;
  const gaps: string[] = [];
  if (!a) gaps.push("A breakdown by group was not possible with the data available.");
  if (input.historyUnavailableReason && !input.similarDrops) gaps.push(input.historyUnavailableReason);
  return { headline, sections, calmNote: CALM_NOTE, dataGaps: gaps };
}

export function explain(input: ExplainInput): Explanation {
  switch (input.alert.kind) {
    case "price_drop_1h":
    case "price_drop_24h":
      return priceDrop(input);
    case "depeg":
      return depeg(input);
    case "below_cost_basis":
      return costBasis(input);
    case "near_low":
      return nearLow(input);
    case "volume_spike":
    case "stable_volume_anomaly":
    case "volume_dry_up":
      return volume(input);
    case "category_rotation":
      return category(input);
    case "portfolio_drop":
      return portfolio(input);
  }
}
