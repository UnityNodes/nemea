import type { Metadata } from "next";

export const OG_SIZE = { width: 1200, height: 630 } as const;

export const DEFAULT_TITLE = "Nemea | Calm protection for your crypto";
export const DEFAULT_DESCRIPTION = "Nemea watches your crypto with CoinMarketCap data and tells you calmly when something looks wrong. Non-custodial, not a trading bot, not financial advice.";

type OgPage = {
  path: string | null;
  title: string | null;
  description: string;
  headline: string;
  accent: string | null;
  sub: string;
  alt: string;
  noindex: boolean;
};

export const OG_PAGES = {
  home: {
    path: "/",
    title: null,
    description: DEFAULT_DESCRIPTION,
    headline: "The lion was invincible.",
    accent: "Then it wasn’t.",
    sub: "Nemea watches your crypto while you are offline and calmly tells you when something looks wrong.",
    alt: "Nemea: The lion was invincible. Then it wasn’t. Calm alerts for your crypto.",
    noindex: false,
  },
  app: {
    path: "/app",
    title: "Dashboard",
    description: "Your holdings, calm alerts and optional protective actions in one place. Nemea never holds your funds.",
    headline: "Your dashboard",
    accent: null,
    sub: "Holdings, calm alerts and optional protective actions in one place.",
    alt: "Nemea dashboard: holdings, calm alerts and protective actions.",
    noindex: true,
  },
  alert: {
    path: null,
    title: "Alert",
    description: "What happened, why it may have happened and what you can do about it, explained like you are five.",
    headline: "Explained like you are five.",
    accent: null,
    sub: "What happened, why it may have happened, and what you can do about it.",
    alt: "Nemea alert: what happened and what you can do, explained like you are five.",
    noindex: true,
  },
  status: {
    path: "/status",
    title: "System status",
    description: "The live CoinMarketCap data source, credit budget and polling plan behind Nemea, shown openly.",
    headline: "System status",
    accent: null,
    sub: "The live data source, credit budget and polling plan, shown openly.",
    alt: "Nemea system status: the live CoinMarketCap data source, credit budget and polling plan.",
    noindex: false,
  },
  "verify-email": {
    path: "/verify-email",
    title: "Confirm your email",
    description: "One step to turn on email alerts from Nemea.",
    headline: "Confirm your email",
    accent: null,
    sub: "One step to turn on email alerts.",
    alt: "Nemea: confirm your email to turn on email alerts.",
    noindex: true,
  },
  "not-found": {
    path: null,
    title: "Page not found",
    description: "The page you followed does not exist. Nothing is wrong with your portfolio or your funds.",
    headline: "This valley is",
    accent: "empty.",
    sub: "The page you followed does not exist here. Nothing is wrong with your funds.",
    alt: "Nemea: this valley is empty. Page not found.",
    noindex: true,
  },
} as const satisfies Record<string, OgPage>;

export type OgKey = keyof typeof OG_PAGES;

export function isOgKey(value: string): value is OgKey {
  return Object.hasOwn(OG_PAGES, value);
}

export function siteBase(): URL | undefined {
  const raw = process.env.PUBLIC_WEB_URL?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

export function pageMetadata(key: OgKey): Metadata {
  const page: OgPage = OG_PAGES[key];
  const title = page.title === null ? DEFAULT_TITLE : `${page.title} | Nemea`;
  const image = { url: `/og/${key}`, width: OG_SIZE.width, height: OG_SIZE.height, alt: page.alt };
  return {
    ...(page.title === null ? {} : { title: page.title }),
    description: page.description,
    ...(page.noindex ? { robots: { index: false } } : {}),
    openGraph: { title, description: page.description, siteName: "Nemea", type: "website", locale: "en_US", ...(page.path === null ? {} : { url: page.path }), images: [image] },
    twitter: { card: "summary_large_image", title, description: page.description, images: [{ url: image.url, alt: image.alt }] },
  };
}
