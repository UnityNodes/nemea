"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useMe, useStartGuest } from "@/lib/queries";
import { readSessionHint } from "@/lib/session-hint";

type Props = { size?: ButtonProps["size"]; variant?: ButtonProps["variant"]; className?: string; showError?: boolean };

export function StartGuestButton({ size = "lg", variant = "primary", className, showError = true }: Props) {
  const router = useRouter();
  const [hint, setHint] = useState(false);
  useEffect(() => setHint(readSessionHint()), []);
  const me = useMe(hint);
  const start = useStartGuest();
  const signedIn = !!me.data;
  const go = () => {
    if (signedIn) {
      router.push("/app");
      return;
    }
    start.mutate(undefined, { onSuccess: () => router.push("/app") });
  };
  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={go} loading={start.isPending}>
        {signedIn ? "Open your dashboard" : "Start as guest"}
        {start.isPending ? null : <ArrowRight className="size-4" aria-hidden />}
      </Button>
      {showError && start.isError ? (
        <p role="alert" className="basis-full text-sm font-medium text-crit-text">
          {errorMessage(start.error)}
        </p>
      ) : null}
    </>
  );
}
