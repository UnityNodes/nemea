"use client";

import Link from "next/link";
import { Activity, ArrowRight, FlaskConical, PieChart, TrendingDown, Waves, type LucideIcon } from "lucide-react";
import type { SimulateScenario } from "@nemea/shared-types";
import { ApiClientError, errorMessage } from "@/lib/api";
import { simulationHint } from "@/lib/hints";
import { useSimulate } from "@/lib/queries";
import { cn } from "@/lib/cn";

const scenarios: Array<{ id: SimulateScenario; label: string; body: string; icon: LucideIcon }> = [
  { id: "drop", label: "Price drop", body: "One of your coins falls sharply", icon: TrendingDown },
  { id: "portfolio_drop", label: "Portfolio drop", body: "Your whole portfolio slides", icon: PieChart },
  { id: "depeg", label: "Stablecoin depeg", body: "A stablecoin slips below its peg", icon: Waves },
  { id: "volume_spike", label: "Volume spike", body: "Trading suddenly surges", icon: Activity },
];

export function SimulatePanel() {
  const simulate = useSimulate();
  const pendingScenario = simulate.isPending ? simulate.variables : null;
  const error = simulate.error;
  const hint = error instanceof ApiClientError ? simulationHint(error.code) : null;

  return (
    <section aria-labelledby="try-heading" className="rounded-[var(--radius-panel)] border border-line bg-sunken/70 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-5 text-muted" aria-hidden />
        <h2 id="try-heading" className="text-lg font-semibold">
          Try an alert
        </h2>
      </div>
      <p className="mt-2 text-sm text-muted">This is a simulation using the real alert engine on your real holdings; the price move is made up.</p>
      <div className="mt-4 grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
        {scenarios.map((s) => {
          const busy = pendingScenario === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => simulate.mutate(s.id)}
              disabled={simulate.isPending}
              aria-busy={busy || undefined}
              className={cn(
                "flex min-h-[4.5rem] items-start gap-3 rounded-[var(--radius-control)] border border-line-strong bg-surface p-3 text-left transition-[background-color,transform] duration-200 hover:bg-bg active:translate-y-px disabled:opacity-60",
                busy && "border-primary",
              )}
            >
              <s.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-semibold">{busy ? "Simulating..." : s.label}</span>
                <span className="block text-sm text-muted">{s.body}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div aria-live="polite" className="mt-3">
        {simulate.isError ? (
          <div role="alert" className="rounded-[var(--radius-control)] bg-warn-soft p-3 text-sm text-warn-text">
            <p className="font-semibold">{errorMessage(error)}</p>
            {hint ? <p className="mt-1">{hint}</p> : null}
          </div>
        ) : null}
        {simulate.isSuccess ? (
          <div className="rounded-[var(--radius-control)] bg-safe-soft p-3 text-sm text-safe-text">
            <p className="font-semibold">Simulated alert created. It is at the top of your feed and marked as a simulation.</p>
            <Link href={`/alerts/${simulate.data.alert.id}`} className="mt-1.5 inline-flex min-h-11 items-center gap-1.5 font-semibold underline underline-offset-4">
              Open it and try Explain like I&apos;m 5
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
