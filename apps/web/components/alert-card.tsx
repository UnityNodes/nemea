"use client";

import Link from "next/link";
import { Check, FlaskConical, ShieldCheck, Sparkles } from "lucide-react";
import type { AlertRecord } from "@nemea/shared-types";
import { Disclaimer } from "@/components/disclaimer";
import { SEVERITY } from "@/components/severity";
import { TokenIcon } from "@/components/token-icon";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDateTime, relativeTime } from "@/lib/format";

type Props = {
  alert: AlertRecord;
  protectionLevel: number;
  now: number;
  onMarkRead?: (id: string) => void;
  markingRead?: boolean;
};

export function AlertCard({ alert, protectionLevel, now, onMarkRead, markingRead = false }: Props) {
  const meta = SEVERITY[alert.severity];
  const unread = alert.readAt === null;
  const Icon = meta.icon;
  return (
    <article
      aria-label={`${meta.label} alert: ${alert.title}`}
      className={cn("rounded-[var(--radius-panel)] border border-line border-l-4 bg-surface p-4 shadow-[var(--shadow-soft)] sm:p-5", meta.stripe)}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Badge tone={meta.tone}>
          <Icon className="size-3.5" aria-hidden />
          {meta.label}
        </Badge>
        {alert.simulated ? (
          <Badge tone="outline">
            <FlaskConical className="size-3.5" aria-hidden />
            Simulation
          </Badge>
        ) : null}
        {alert.symbol ? (
          <Badge tone="neutral" className="gap-1.5">
            <TokenIcon cmcId={alert.cmcId} symbol={alert.symbol} size="sm" className="-ml-1 size-4" />
            {alert.symbol}
          </Badge>
        ) : null}
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
          {unread ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-safe-text">
              <span className="size-2 rounded-full bg-primary" aria-hidden />
              New
            </span>
          ) : null}
          <time dateTime={alert.createdAt} title={formatDateTime(alert.createdAt)}>
            {relativeTime(alert.createdAt, now)}
          </time>
        </span>
      </div>
      <h3 className={cn("mt-3 text-base leading-snug sm:text-lg", unread ? "font-bold" : "font-semibold")}>{alert.title}</h3>
      <p className="mt-1.5 text-[0.95rem] text-muted">{alert.summary}</p>
      {alert.facts.length > 0 ? (
        <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-line pt-3.5">
          {alert.facts.map((fact) => (
            <div key={`${fact.label}-${fact.value}`} className="min-w-0">
              <dt className="text-xs font-semibold text-faint">{fact.label}</dt>
              <dd className="num break-words text-sm font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={`/alerts/${alert.id}`} className={buttonVariants({ variant: "subtle", size: "sm" })}>
          <Sparkles className="size-4" aria-hidden />
          Explain like I&apos;m 5
        </Link>
        {protectionLevel >= 2 ? (
          <Link href={`/alerts/${alert.id}#protect`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <ShieldCheck className="size-4" aria-hidden />
            Protect
          </Link>
        ) : null}
        {unread && onMarkRead ? (
          <Button variant="ghost" size="sm" onClick={() => onMarkRead(alert.id)} loading={markingRead} className="ml-auto">
            <Check className="size-4" aria-hidden />
            Mark read
          </Button>
        ) : null}
      </div>
      <Disclaimer compact className="mt-4 border-t border-line pt-3" />
    </article>
  );
}
