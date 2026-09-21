import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Figtree, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], style: ["normal", "italic"], variable: "--font-cormorant", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

const title = "Nemea | Calm protection for your crypto";
const description = "Nemea watches your crypto with CoinMarketCap data and tells you calmly when something looks wrong. Non-custodial, not a trading bot, not financial advice.";

export const metadata: Metadata = {
  title: { default: title, template: "%s | Nemea" },
  description,
  applicationName: "Nemea",
  openGraph: { title, description, siteName: "Nemea", type: "website", locale: "en_US" },
  twitter: { card: "summary", title, description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#141712" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${cormorant.variable} ${jetbrains.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only rounded-lg bg-primary px-4 py-3 font-semibold text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60]"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
