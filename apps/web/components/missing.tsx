import { cn } from "@/lib/cn";
import { MISSING } from "@/lib/format";

export function Missing({ reason, className }: { reason: string; className?: string }) {
  return (
    <span className={cn("text-muted", className)} title={reason}>
      <span aria-hidden>{MISSING}</span>
      <span className="sr-only">{reason}</span>
    </span>
  );
}
