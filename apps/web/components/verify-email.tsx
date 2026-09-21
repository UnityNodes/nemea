"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MailCheck, MailX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { useVerifyEmail } from "@/lib/queries";

export function VerifyEmail() {
  const params = useSearchParams();
  const token = params.get("token");
  const verify = useVerifyEmail();
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verify.mutate(token);
  }, [token, verify]);

  return (
    <div aria-live="polite" className="rounded-[var(--radius-panel)] border border-line bg-surface p-6 shadow-[var(--shadow-soft)] sm:p-8">
      {!token ? (
        <>
          <MailX className="size-8 text-crit-text" aria-hidden />
          <h1 className="display mt-3 text-4xl">This link is incomplete</h1>
          <p className="mt-2 text-muted">The confirmation token is missing. Open the link from your email again, or request a new one in Settings.</p>
        </>
      ) : verify.isSuccess ? (
        <>
          <MailCheck className="size-8 text-primary" aria-hidden />
          <h1 className="display mt-3 text-4xl">Email confirmed</h1>
          <p className="mt-2 text-muted">Nemea can now send alerts to this address. You can change or remove it in Settings at any time.</p>
        </>
      ) : verify.isError ? (
        <>
          <MailX className="size-8 text-crit-text" aria-hidden />
          <h1 className="display mt-3 text-4xl">That did not work</h1>
          <p role="alert" className="mt-2 text-muted">
            {errorMessage(verify.error)}
          </p>
          <p className="mt-2 text-sm text-muted">You can ask for a new confirmation link from Settings in your dashboard.</p>
        </>
      ) : (
        <div aria-busy="true" className="flex flex-col gap-3">
          <p className="font-semibold">Confirming your email...</p>
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </div>
      )}
      <Link href="/app" className={`${buttonVariants({ variant: "primary" })} mt-6`}>
        Go to your dashboard
      </Link>
    </div>
  );
}
