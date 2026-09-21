import { Sparkles, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function AlertSpecimen() {
  return (
    <figure className="w-full">
      <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-soft)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <Badge tone="outline">Example, not a live alert</Badge>
          <Badge tone="warn">
            <TriangleAlert className="size-3.5" aria-hidden />
            Warning
          </Badge>
        </div>
        <div className="mt-4 border-l-[3px] border-warn-solid pl-4">
          <h3 className="text-lg font-semibold leading-snug">A coin you hold moved a lot in one day</h3>
          <p className="mt-1.5 text-muted">Real alerts name the coin, show the data behind the move, and stay calm about it.</p>
          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-faint">What we saw</dt>
              <dd className="text-sm">A 24-hour move past your threshold</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-faint">Your threshold</dt>
              <dd className="text-sm">You set it in Settings</dd>
            </div>
          </dl>
        </div>
        <div className="mt-5 rounded-[var(--radius-control)] bg-safe-soft p-4 text-safe-text">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4" aria-hidden />
            Explain like I&apos;m 5
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            Think of a price tag in a shop that suddenly changed. The thing on the shelf is the same thing. What people will pay for it today is different, and that is all this alert is telling you.
          </p>
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-muted">A static illustration of the tone and layout. It contains no real market data.</figcaption>
    </figure>
  );
}
