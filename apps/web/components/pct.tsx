import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Missing } from "@/components/missing";
import { cn } from "@/lib/cn";
import { changeTone, formatPct } from "@/lib/format";

type Props = { value: number | null | undefined; missing?: string; className?: string; digits?: number };

export function Pct({ value, missing = "Not available yet", className, digits = 2 }: Props) {
  const tone = changeTone(value);
  if (tone === "unknown") return <Missing reason={missing} className={className} />;
  const Icon = tone === "up" ? ArrowUpRight : tone === "down" ? ArrowDownRight : Minus;
  return (
    <span className={cn("num inline-flex items-center gap-0.5 align-middle font-semibold", tone === "up" && "text-safe-text", tone === "down" && "text-warn-text", tone === "flat" && "text-muted", className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {formatPct(value, digits)}
    </span>
  );
}
