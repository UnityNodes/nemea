"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellOff, CheckCheck } from "lucide-react";
import { AlertCard } from "@/components/alert-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { useAlerts, useMarkAllRead, useMarkRead, useNow } from "@/lib/queries";

const INITIAL_VISIBLE = 4;

function WeekMeter({ count, cap }: { count: number; cap: number }) {
  const pips = Math.max(cap, 1);
  return (
    <div className="flex items-center gap-3" role="group" aria-label="Alerts this week">
      <span className="flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: pips }, (_, i) => (
          <span key={i} className={i < count ? "size-3 rounded-full bg-primary" : "size-3 rounded-full border-2 border-line-strong"} />
        ))}
      </span>
      <span className="num text-sm font-semibold">
        {count} of {cap} alerts this week
      </span>
    </div>
  );
}

export function AlertsFeed({ protectionLevel }: { protectionLevel: number }) {
  const alerts = useAlerts(true);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const now = useNow();
  const [expanded, setExpanded] = useState(false);

  const list = alerts.data?.alerts ?? [];
  const visible = expanded ? list : list.slice(0, INITIAL_VISIBLE);
  const hasUnread = list.some((a) => a.readAt === null);

  return (
    <section aria-labelledby="alerts-heading" className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <h2 id="alerts-heading" className="display text-3xl">
          Alerts
        </h2>
        {hasUnread ? (
          <Button variant="ghost" size="sm" onClick={() => markAll.mutate()} loading={markAll.isPending}>
            <CheckCheck className="size-4" aria-hidden />
            Mark all read
          </Button>
        ) : null}
      </div>
      {alerts.data ? (
        <div className="mt-2">
          <WeekMeter count={alerts.data.week.count} cap={alerts.data.week.cap} />
          <p className="mt-1 text-sm text-muted">Simulated alerts do not count towards this limit.</p>
        </div>
      ) : null}

      <div className="mt-5" aria-live="polite">
        {alerts.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : alerts.isError ? (
          <div role="alert" className="rounded-[var(--radius-panel)] border border-line bg-surface p-5">
            <p className="font-semibold">Alerts could not be loaded.</p>
            <p className="mt-1 text-sm text-muted">{errorMessage(alerts.error)}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void alerts.refetch()}>
              Try again
            </Button>
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-[var(--radius-panel)] border border-dashed border-line-strong p-6 text-center">
            <BellOff className="mx-auto size-6 text-muted" aria-hidden />
            <p className="mt-3 font-semibold">Nothing to worry about yet.</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted">Nemea only speaks up when something matters. To see what an alert looks like, try a simulation below.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {visible.map((alert) => (
                <motion.li key={alert.id} layout="position" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
                  <AlertCard alert={alert} protectionLevel={protectionLevel} now={now} onMarkRead={(id) => markRead.mutate(id)} markingRead={markRead.isPending && markRead.variables === alert.id} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
        {markRead.isError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-crit-text">
            {errorMessage(markRead.error)}
          </p>
        ) : null}
        {list.length > INITIAL_VISIBLE ? (
          <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show fewer" : `Show all ${list.length} alerts`}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
