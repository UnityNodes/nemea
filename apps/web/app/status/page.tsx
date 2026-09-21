import type { Metadata } from "next";
import { MarketingHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StatusView } from "@/components/status-view";

export const metadata: Metadata = {
  title: "System status",
  description: "How Nemea gets its market data, what the data plan allows, how often each check runs, and a live log of every CoinMarketCap call.",
};

export default function StatusPage() {
  return (
    <>
      <MarketingHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <StatusView />
      </main>
      <SiteFooter />
    </>
  );
}
