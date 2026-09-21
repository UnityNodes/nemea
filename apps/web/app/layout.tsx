import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Providers } from "@/components/providers";
import { DEFAULT_TITLE, pageMetadata, siteBase } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: siteBase(),
  title: { default: DEFAULT_TITLE, template: "%s | Nemea" },
  applicationName: "Nemea",
  ...pageMetadata("home"),
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
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
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
