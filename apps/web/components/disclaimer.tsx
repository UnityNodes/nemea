import { Scale } from "lucide-react";
import { DISCLAIMER } from "@nemea/shared-types";
import { cn } from "@/lib/cn";

export function Disclaimer({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <p className={cn("flex items-start gap-2 text-muted", compact ? "text-xs leading-relaxed" : "text-sm leading-relaxed", className)}>
      <Scale className={cn("mt-0.5 shrink-0", compact ? "size-3.5" : "size-4")} aria-hidden />
      <span>{DISCLAIMER}</span>
    </p>
  );
}
