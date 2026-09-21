"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { Disclaimer } from "@/components/disclaimer";
import { ExplainSection } from "@/components/explain-section";
import { ProtectSection } from "@/components/protect-section";
import { SEVERITY } from "@/components/severity";
import { SessionGate } from "@/components/session-gate";
import { AppHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, errorMessage } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useAlert, useMarkRead, useNow } from "@/lib/queries";
import type { DeliveryView } from "@/lib/types";

const CHANNEL_LABEL: Record<DeliveryView["channel"], string> = { telegram: "Telegram", email: "Email", push: "Browser notification" };

function DetailBody({ id, level }: { id: string; level: number }) {
  const alert = useAlert(id, true);
  const markRead = useMarkRead();
  const now = useNow();
  const marked = useRef(false);
  const record = alert.data?.alert;

  useEffect(() => {
    if (record && record.readAt === null && !marked.current) {
      marked.current = true;
      markRead.mutate(record.id);
    }
  }, [record, markRead]);

  useEffect(() => {
    if (!record || window.location.hash !== "#protect") return;
    const timer = window.setTimeout(() => document.getElementById("protect")?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    return () => window.clearTimeout(timer);
  }, [record]);

  if (alert.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-14 w-full max-w-2xl" />
        <Skeleton className="h-20 w-full max-w-2xl" />
        <Skeleton className="mt-6 h-48" />
      </div>
    );
  }
  if (alert.isError) {
    const missing = alert.error instanceof ApiClientError && alert.error.status === 404;
    return (
      <div role="alert" className="max-w-lg rounded-[var(--radius-panel)] border border-line bg-surface p-6">
        <h1 className="display text-4xl">{missing ? "That alert is gone" : "The alert could not be loaded"}</h1>
        <p className="mt-2 text-muted">{errorMessage(alert.error)}</p>
        <div className="mt-5 flex gap-3">
          {!missing ? (
            <Button variant="secondary" onClick={() => void alert.refetch()}>
              Try again
            </Button>
          ) : null}
          <Link href="/app" className={buttonVariants({ variant: missing ? "primary" : "ghost" })}>
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const data = alert.data;
  const meta = SEVERITY[data.alert.severity];
  const Icon = meta.icon;
  const deliveries = data.deliveries;

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <header className={`border-l-4 pl-5 sm:pl-7 ${meta.stripe}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>
            <Icon className="size-3.5" aria-hidden />
            {meta.label}
          </Badge>
          {data.alert.simulated ? (
            <Badge tone="outline">
              <FlaskConical className="size-3.5" aria-hidden />
              Simulation
            </Badge>
          ) : null}
          {data.alert.symbol ? <Badge tone="neutral">{data.alert.symbol}</Badge> : null}
          <time dateTime={data.alert.createdAt} title={formatDateTime(data.alert.createdAt)} className="text-sm text-muted">
            {relativeTime(data.alert.createdAt, now)}
          </time>
        </div>
        <h1 className="display mt-4 max-w-3xl text-[clamp(2.2rem,5.4vw,3.6rem)]">{data.alert.title}</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">{data.alert.summary}</p>
        {data.alert.simulated ? <p className="mt-3 max-w-2xl rounded-[var(--radius-control)] bg-sunken p-3 text-sm text-muted">This alert came from a simulation. The alert engine and your holdings are real, but the price move was made up.</p> : null}
        {data.alert.facts.length > 0 ? (
          <dl className="mt-6 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-3 min-[480px]:grid-cols-2">
            {data.alert.facts.map((fact) => (
              <div key={`${fact.label}-${fact.value}`} className="border-t border-line pt-2">
                <dt className="text-xs font-semibold text-faint">{fact.label}</dt>
                <dd className="num text-base font-medium">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {deliveries.length > 0 ? (
          <p className="mt-5 text-sm text-muted">
            Delivery:{" "}
            {deliveries.map((d, i) => (
              <span key={`${d.channel}-${d.at}`}>
                {i > 0 ? ", " : ""}
                {CHANNEL_LABEL[d.channel]} {d.status}
              </span>
            ))}
            .
          </p>
        ) : null}
        <Disclaimer className="mt-6 max-w-2xl" />
      </header>

      <ExplainSection id={id} />
      <ProtectSection alertId={id} level={level} />
    </div>
  );
}

export function AlertDetail({ id }: { id: string }) {
  return (
    <>
      <AppHeader current="alert" />
      <main id="main" className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
        <Link href="/app" className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          Back to dashboard
        </Link>
        <SessionGate>{(me) => <DetailBody id={id} level={me.preferences.protectionLevel} />}</SessionGate>
      </main>
    </>
  );
}
