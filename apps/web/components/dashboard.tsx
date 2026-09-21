"use client";

import { AlertsFeed } from "@/components/alerts-feed";
import { Disclaimer } from "@/components/disclaimer";
import { Holdings } from "@/components/holdings";
import { PortfolioSummary } from "@/components/portfolio-summary";
import { SessionGate } from "@/components/session-gate";
import { SettingsSheet } from "@/components/settings-sheet";
import { AppHeader } from "@/components/site-header";
import { SimulatePanel } from "@/components/simulate-panel";
import { useMe } from "@/lib/queries";

export function Dashboard() {
  const me = useMe();
  return (
    <>
      <AppHeader current="dashboard" right={me.data ? <SettingsSheet me={me.data} /> : null} />
      <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
        <SessionGate>
          {(session) => (
            <>
              <PortfolioSummary />
              <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div className="order-2 lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-1">
                  <Holdings />
                </div>
                <div className="order-1 lg:order-none lg:col-start-2 lg:row-start-1">
                  <AlertsFeed protectionLevel={session.preferences.protectionLevel} />
                </div>
                <div className="order-3 lg:order-none lg:col-start-2 lg:row-start-2">
                  <SimulatePanel />
                </div>
              </div>
              <Disclaimer className="mt-14 max-w-2xl border-t border-line pt-6" />
            </>
          )}
        </SessionGate>
      </main>
    </>
  );
}
