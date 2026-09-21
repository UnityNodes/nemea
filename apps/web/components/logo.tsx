import { useId } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

const PETAL_COUNT = 12;

export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  const maskId = `${id}-valley`;
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="Nemea" className={cn("size-8 text-primary", className)}>
      <defs>
        <mask id={maskId}>
          <rect width="32" height="32" fill="#fff" />
          <path d="M12.2 14.2 16 18.6l3.8-4.4" fill="none" stroke="#000" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <g fill="currentColor">
        {Array.from({ length: PETAL_COUNT }, (_, i) => (
          <path key={i} d="M16 1.6c2.8 2.6 2.8 5.6 0 7.8-2.8-2.2-2.8-5.2 0-7.8Z" transform={`rotate(${(360 / PETAL_COUNT) * i} 16 16)`} />
        ))}
        <circle cx="16" cy="16" r="5.6" mask={`url(#${maskId})`} />
      </g>
    </svg>
  );
}

export function Wordmark({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex min-h-11 items-center gap-2.5 rounded-lg", className)} aria-label="Nemea home">
      <LogoMark className="size-8 transition-transform duration-500 ease-[var(--ease-calm)] group-hover:rotate-[15deg] motion-reduce:transition-none" />
      <span className="display text-[1.4rem] leading-none text-ink">Nemea</span>
    </Link>
  );
}
