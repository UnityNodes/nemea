"use client";

import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useSiweSignIn } from "@/lib/siwe";

type Props = { size?: ButtonProps["size"]; variant?: ButtonProps["variant"]; className?: string; label?: string; redirect?: boolean; onSuccess?: () => void };

export function WalletSignIn({ size = "lg", variant = "secondary", className, label = "Sign in with wallet", redirect = true, onSuccess }: Props) {
  const router = useRouter();
  const { signIn, pending, error } = useSiweSignIn();
  const run = async () => {
    const me = await signIn();
    if (!me) return;
    onSuccess?.();
    if (redirect) router.push("/app");
  };
  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={run} loading={pending}>
        {pending ? null : <Wallet className="size-4" aria-hidden />}
        {label}
      </Button>
      <div aria-live="polite" className="basis-full">
        {error ? (
          <p role="alert" className="text-sm font-medium text-crit-text">
            {error}
          </p>
        ) : null}
      </div>
    </>
  );
}
