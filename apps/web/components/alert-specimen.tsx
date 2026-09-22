import { Sparkles, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function AlertSpecimen() {
  return (
    <figure className="w-full">
      <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-soft)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <Badge tone="outline">Example, not a live alert</Badge>
          <Badge tone="warn">
            <TriangleAlert className="size-3.5" aria-hidden />
            Warning
          </Badge>
        </div>
        <div className="mt-4 border-l-[3px] border-warn-solid pl-4">
          <h3 className="text-lg font-semibold leading-snug">Your portfolio is down 9% in 24 hours</h3>
          <p className="mt-1.5 text-muted">
            Your holdings are worth about $10,800 now, from about $11,900 a day ago. About 64% of the drop comes from Smart Contracts, which is down 8.1% on average across CoinMarketCap.
          </p>
          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-faint">From Smart Contracts</dt>
              <dd className="text-sm">64% of the drop (ETH, LINK)</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-faint">Whole market, 24h</dt>
              <dd className="text-sm">-1.2%</dd>
            </div>
          </dl>
        </div>
        <div className="mt-5 rounded-[var(--radius-control)] bg-safe-soft p-4 text-safe-text">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4" aria-hidden />
            Explain like I&apos;m 5
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            Your coins are grouped like fruit in a bowl. Today the whole bowl of "apples" got cheaper on CoinMarketCap, not just yours. Most of your drop is the bowl, not something wrong with your apples.
          </p>
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-muted">A static illustration of the tone and layout. It contains no real market data.</figcaption>
    </figure>
  );
}
