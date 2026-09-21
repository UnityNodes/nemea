import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold leading-none whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-sunken text-muted",
      safe: "bg-safe-soft text-safe-text",
      warn: "bg-warn-soft text-warn-text",
      crit: "bg-crit-soft text-crit-text",
      info: "bg-info-soft text-info-text",
      outline: "border border-line-strong text-muted",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
