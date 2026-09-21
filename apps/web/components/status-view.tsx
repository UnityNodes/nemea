"use client";

import { Bell, CheckCircle2, Mail, PauseCircle, RefreshCw, Send, XCircle } from "lucide-react";
import type { CallReceiptView, PollLaneStatus, SystemStatus } from "@nemea/shared-types";
import { Missing } from "@/components/missing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { cadenceLabel, formatClock, formatInt, formatMs, formatDateTime, hitRatio, isNumber, relativeTime } from "@/lib/format";
import { useNow, useSystemStatus } from "@/lib/queries";

const LANES: Record<PollLaneStatus["lane"], { label: string; body: string }> = {
  stablecoins: { label: "Stablecoin pegs", body: "Stablecoins, watched for a slip away from $1" },
  top: { label: "Larger holdings", body: "The coins that carry most of the value in watched portfolios" },
  small: { label: "Smaller holdings", body: "Everything else, checked less often" },
  global: { label: "Whole market", body: "Overall market size and stablecoin volume" },
  categories: { label: "Sectors", body: "How groups of coins, such as Layer 1, are moving" },
};

const ENDPOINTS: Array<{ path: string; name: string; use: string }> = [
  { path: "/v3/cryptocurrency/quotes/latest", name: "Latest quotes", use: "Current prices, price changes and trading volume for your coins." },
  { path: "/v3/cryptocurrency/quotes/historical", name: "Historical quotes", use: "Recent price history, so explanations can say what changed and when." },
  { path: "/v1/global-metrics/quotes/latest", name: "Global metrics", use: "Whole-market moves and stablecoin volume." },
  { path: "/v2/cryptocurrency/info", name: "Coin information", use: "Names, tags and contract addresses, so the right coin is watched." },
  { path: "/v1/cryptocurrency/categories", name: "Categories", use: "How whole sectors are moving." },
  { path: "/v2/cryptocurrency/price-performance-stats/latest", name: "Price performance stats", use: "Highs and lows over time. Only used when the data plan allows it." },
];

const VERDICTS: Record<SystemStatus["budgetVerdict"], { tone: "safe" | "warn" | "crit" | "neutral"; label: string; body: string }> = {
  fits: { tone: "safe", label: "Fits the plan", body: "Nemea's checks fit inside the plan's monthly allowance, so it runs at its normal pace." },
  stretched: { tone: "warn", label: "Tight", body: "The plan is tight, so Nemea slows some checks to stay inside the monthly allowance." },
  insufficient: { tone: "crit", label: "Too small", body: "The plan is too small for the full schedule. Checks are slowed a lot, so alerts can arrive later." },
  unknown: { tone: "neutral", label: "Not worked out yet", body: "Nemea has not worked out its data budget yet. This usually means the server just started." },
};

function Stat({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="num mt-1 text-2xl font-semibold leading-tight">{children}</dd>
      {note ? <p className="mt-1 text-sm text-muted">{note}</p> : null}
    </div>
  );
}

function Panel({ title, description, children, id }: { title: string; description?: string; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={`${id ?? title}-h`} className="scroll-mt-24">
      <h2 id={`${id ?? title}-h`} className="display text-3xl">
        {title}
      </h2>
      {description ? <p className="mt-1.5 max-w-3xl text-muted">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function cadenceSentence(status: SystemStatus): string {
  const stable = status.lanes.find((l) => l.lane === "stablecoins");
  const multiplier = status.cadenceMultiplier;
  if (!Number.isFinite(multiplier) || multiplier <= 1) return "Nemea is checking at its normal pace. No slowdown is needed.";
  const times = Number.isInteger(multiplier) ? String(multiplier) : multiplier.toFixed(1);
  if (stable) return `Because of the plan's limits, Nemea checks stablecoin pegs ${cadenceLabel(stable.intervalSeconds)}, which is ${times} times slower than its normal pace.`;
  return `Because of the plan's limits, Nemea runs its checks ${times} times slower than its normal pace.`;
}

function PlanPanel({ status }: { status: SystemStatus }) {
  const verdict = VERDICTS[status.budgetVerdict];
  const estimateKnown = status.budgetVerdict !== "unknown";
  return (
    <Panel title="The data plan" description="Nemea reads market data from CoinMarketCap. The plan decides how many calls it may make, so Nemea adapts how often it checks.">
      <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-soft)] sm:p-6">
        {status.dataSource.official ? (
          <p className="mb-5 text-sm text-muted">
            Data source: <span className="font-mono text-ink">{status.dataSource.host}</span>
          </p>
        ) : (
          <p role="alert" className="mb-5 rounded-[var(--radius-control)] border border-line bg-sunken px-3.5 py-3 text-sm font-medium">
            Development data. This server is not talking to CoinMarketCap ({status.dataSource.host}), so the numbers here and in the dashboard are not real market data.
          </p>
        )}
        <dl className="grid grid-cols-1 gap-6 min-[520px]:grid-cols-2 lg:grid-cols-4">
          <Stat label="Monthly credits" note="What the plan allows">
            {isNumber(status.creditLimitMonthly) ? formatInt(status.creditLimitMonthly) : <Missing reason="CoinMarketCap has not reported a monthly limit" />}
          </Stat>
          <Stat label="Calls per minute" note="Rate limit">
            {isNumber(status.rateLimitPerMinute) ? formatInt(status.rateLimitPerMinute) : <Missing reason="CoinMarketCap has not reported a rate limit" />}
          </Stat>
          <Stat label="Estimated use per month" note="At the current schedule">
            {estimateKnown ? formatInt(status.estimatedCreditsPerMonth) : <Missing reason="Not worked out yet" />}
          </Stat>
          <Stat label="Used since start" note="Credits spent by this server run">
            {formatInt(status.creditsSpentThisRun)}
          </Stat>
        </dl>
        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5">
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone={verdict.tone}>{verdict.label}</Badge>
            <span className="font-medium">{verdict.body}</span>
          </p>
          <p className="max-w-3xl text-muted">{cadenceSentence(status)}</p>
        </div>
      </div>
    </Panel>
  );
}

function LanesPanel({ status, now }: { status: SystemStatus; now: number }) {
  return (
    <Panel title="What Nemea checks, and how often" description="Each lane is a group of coins watched on its own schedule. If a lane has never succeeded, it says so.">
      <div className="hidden overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Polling lanes with interval, last success, items watched and last error</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold text-faint">
              <th scope="col" className="px-4 py-3 font-semibold">Lane</th>
              <th scope="col" className="px-3 py-3 font-semibold">Runs</th>
              <th scope="col" className="px-3 py-3 font-semibold">Last success</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Items</th>
              <th scope="col" className="px-4 py-3 font-semibold">Last error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {status.lanes.map((lane) => (
              <tr key={lane.lane} className="align-top">
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  <span className="block font-semibold">{LANES[lane.lane].label}</span>
                  <span className="block max-w-xs text-xs text-muted">{LANES[lane.lane].body}</span>
                </th>
                <td className="px-3 py-3">{cadenceLabel(lane.intervalSeconds)}</td>
                <td className="px-3 py-3">
                  {lane.lastSuccessAt ? <span title={formatDateTime(lane.lastSuccessAt)}>{relativeTime(lane.lastSuccessAt, now)}</span> : <span className="font-medium text-warn-text">never</span>}
                </td>
                <td className="num px-3 py-3 text-right">{formatInt(lane.itemCount)}</td>
                <td className="max-w-[16rem] px-4 py-3">{lane.lastError ? <span className="break-words text-crit-text">{lane.lastError}</span> : <span className="text-muted">None</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2.5 md:hidden">
        {status.lanes.map((lane) => (
          <li key={lane.lane} className="rounded-[var(--radius-panel)] border border-line bg-surface p-4">
            <p className="font-semibold">{LANES[lane.lane].label}</p>
            <p className="text-sm text-muted">{LANES[lane.lane].body}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-xs font-semibold text-faint">Runs</dt>
                <dd>{cadenceLabel(lane.intervalSeconds)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-faint">Last success</dt>
                <dd>{lane.lastSuccessAt ? relativeTime(lane.lastSuccessAt, now) : <span className="font-medium text-warn-text">never</span>}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-faint">Items</dt>
                <dd className="num">{formatInt(lane.itemCount)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-faint">Last error</dt>
                <dd className={lane.lastError ? "break-words text-crit-text" : "text-muted"}>{lane.lastError ?? "None"}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function statusTone(receipt: CallReceiptView): "safe" | "warn" | "crit" | "neutral" {
  if (receipt.httpStatus === null) return "crit";
  if (receipt.ok) return "safe";
  return receipt.httpStatus === 429 ? "warn" : "crit";
}

function HttpBadge({ receipt }: { receipt: CallReceiptView }) {
  const Icon = receipt.ok ? CheckCircle2 : XCircle;
  return (
    <Badge tone={statusTone(receipt)}>
      <Icon className="size-3.5" aria-hidden />
      {receipt.httpStatus === null ? "No response" : receipt.httpStatus}
    </Badge>
  );
}

function ReceiptsPanel({ status, now }: { status: SystemStatus; now: number }) {
  return (
    <Panel title="Live CoinMarketCap calls" description="The most recent requests Nemea's server sent to CoinMarketCap, with the status, cost and time of each answer. This is the server's own log, not a summary.">
      {status.receipts.length === 0 ? (
        <p className="rounded-[var(--radius-panel)] border border-dashed border-line-strong p-6 text-muted">No calls have been made since the server started.</p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface md:block">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Recent CoinMarketCap calls</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold text-faint">
                  <th scope="col" className="px-4 py-3 font-semibold">Time</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Endpoint</th>
                  <th scope="col" className="px-3 py-3 font-semibold">HTTP</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Credits</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Took</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {status.receipts.map((r, i) => (
                  <tr key={`${r.at}-${r.endpoint}-${i}`} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="num block font-medium">{formatClock(r.at)}</span>
                      <span className="block text-xs text-muted">{relativeTime(r.at, now)}</span>
                    </td>
                    <td className="px-3 py-3 font-mono text-[0.8rem]">{r.endpoint}</td>
                    <td className="px-3 py-3">
                      <HttpBadge receipt={r} />
                    </td>
                    <td className="num px-3 py-3 text-right">{isNumber(r.creditCount) ? formatInt(r.creditCount) : <Missing reason="CoinMarketCap did not report a credit cost for this call" />}</td>
                    <td className="num whitespace-nowrap px-3 py-3 text-right">{formatMs(r.ms)}</td>
                    <td className="max-w-[16rem] break-words px-4 py-3 text-muted">{r.detail || <Missing reason="No detail recorded" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2.5 md:hidden">
            {status.receipts.map((r, i) => (
              <li key={`${r.at}-${r.endpoint}-${i}`} className="rounded-[var(--radius-panel)] border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <HttpBadge receipt={r} />
                  <span className="num text-sm text-muted" title={formatDateTime(r.at)}>
                    {formatClock(r.at)}
                  </span>
                </div>
                <p className="mt-2.5 break-all font-mono text-[0.8rem]">{r.endpoint}</p>
                <p className="num mt-1.5 text-sm text-muted">
                  {isNumber(r.creditCount) ? `${formatInt(r.creditCount)} ${r.creditCount === 1 ? "credit" : "credits"}` : "credits not reported"} in {formatMs(r.ms)}
                </p>
                {r.detail ? <p className="mt-1 break-words text-sm text-muted">{r.detail}</p> : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function EndpointsPanel() {
  return (
    <Panel title="Which CoinMarketCap data Nemea uses" description="Nothing else is requested. Nemea never trades and never touches your wallet.">
      <ul className="grid gap-x-10 gap-y-5 md:grid-cols-2">
        {ENDPOINTS.map((e) => (
          <li key={e.path}>
            <p className="font-semibold">{e.name}</p>
            <p className="mt-0.5 break-all font-mono text-xs text-muted">{e.path}</p>
            <p className="mt-1 text-sm">{e.use}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function SystemPanel({ status }: { status: SystemStatus }) {
  const ratio = hitRatio(status.cache.hits, status.cache.misses);
  const channels: Array<{ label: string; icon: typeof Send; on: boolean }> = [
    { label: "Telegram", icon: Send, on: status.channels.telegram },
    { label: "Email", icon: Mail, on: status.channels.email },
    { label: "Browser notifications", icon: Bell, on: status.channels.push },
  ];
  return (
    <Panel title="Around the edges" description="Caching keeps Nemea inside its plan, and each alert channel only works if the server has it set up.">
      <div className="grid gap-x-12 gap-y-8 md:grid-cols-2">
        <div>
          <h3 className="font-semibold">Cache</h3>
          <dl className="mt-3 grid grid-cols-3 gap-4">
            <Stat label="Hits">{formatInt(status.cache.hits)}</Stat>
            <Stat label="Misses">{formatInt(status.cache.misses)}</Stat>
            <Stat label="Hit rate">{ratio === null ? <Missing reason="No requests have gone through the cache yet" /> : `${Math.round(ratio)}%`}</Stat>
          </dl>
          <p className="mt-3 text-sm text-muted">A hit is an answer served from memory. It costs no CoinMarketCap credits.</p>
        </div>
        <div>
          <h3 className="font-semibold">Alert channels on this server</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {channels.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 py-2.5">
                <span className="flex items-center gap-2.5 text-sm font-medium">
                  <c.icon className="size-4 text-muted" aria-hidden />
                  {c.label}
                </span>
                <Badge tone={c.on ? "safe" : "neutral"}>{c.on ? "Configured" : "Not configured"}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">The dashboard itself always shows every alert.</p>
        </div>
      </div>
    </Panel>
  );
}

export function StatusView() {
  const query = useSystemStatus();
  const now = useNow(5000);
  const status = query.data;
  const paused = status?.pausedUntil && Date.parse(status.pausedUntil) > now ? status.pausedUntil : null;

  return (
    <div className="flex flex-col gap-14">
      <header>
        <h1 className="display text-[clamp(2.2rem,5vw,3.4rem)]">System status</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">Where Nemea&apos;s data comes from, what it costs, and proof of every call. No login needed.</p>
        <p className="mt-3 flex items-center gap-2 text-sm text-muted" aria-live="polite">
          <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
          {query.dataUpdatedAt ? `Checked ${relativeTime(new Date(query.dataUpdatedAt).toISOString(), now)}. Refreshes every 15 seconds.` : "Checking now..."}
        </p>
      </header>

      {query.isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-44" />
          <Skeleton className="h-64" />
        </div>
      ) : query.isError && !status ? (
        <div role="alert" className="max-w-lg rounded-[var(--radius-panel)] border border-line bg-surface p-6">
          <p className="font-semibold">The status could not be loaded.</p>
          <p className="mt-1 text-muted">{errorMessage(query.error)}</p>
          <Button variant="secondary" className="mt-4" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : status ? (
        <>
          {query.isError ? (
            <p role="alert" className="rounded-[var(--radius-control)] bg-warn-soft p-3 text-sm font-medium text-warn-text">
              The latest refresh failed, so this page may be out of date. {errorMessage(query.error)}
            </p>
          ) : null}
          {paused ? (
            <div role="status" className="flex items-start gap-3 rounded-[var(--radius-panel)] border border-warn-solid/40 bg-warn-soft p-4 text-warn-text">
              <PauseCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
              <p>
                <span className="font-semibold">Data collection is paused</span> until {formatClock(paused)} ({relativeTime(paused, now)}). Prices shown in the dashboard may be stale until then.
              </p>
            </div>
          ) : null}
          <PlanPanel status={status} />
          <LanesPanel status={status} now={now} />
          <ReceiptsPanel status={status} now={now} />
          <EndpointsPanel />
          <SystemPanel status={status} />
          <p className="text-sm text-muted">Server version {status.version}</p>
        </>
      ) : null}
    </div>
  );
}
