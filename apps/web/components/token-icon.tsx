"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { tokenIconUrl, tokenInitials } from "@/lib/token-icon";

const SIZES = {
  sm: { box: "size-6", text: "text-[0.6rem]", px: 24 },
  md: { box: "size-9", text: "text-[0.7rem]", px: 36 },
} as const;

export function TokenIcon({ cmcId, symbol, size = "md", className }: { cmcId: number | null; symbol: string; size?: keyof typeof SIZES; className?: string }) {
  const [failedId, setFailedId] = useState<number | null>(null);
  const { box, text, px } = SIZES[size];
  const url = cmcId === null ? null : tokenIconUrl(cmcId);
  if (url === null || failedId === cmcId) {
    return (
      <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full bg-sunken font-semibold text-muted", box, text, className)}>
        {tokenInitials(symbol)}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedId(cmcId)}
      className={cn("shrink-0 rounded-full bg-sunken object-cover", box, className)}
    />
  );
}
