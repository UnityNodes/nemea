import * as React from "react";
import { cn } from "@/lib/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, type = "text", ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-3.5 text-base text-ink placeholder:text-faint disabled:opacity-60 aria-[invalid=true]:border-crit-solid",
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-semibold text-ink", className)} {...props} />;
}

export function FieldHint({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}

export function FieldError({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p role="alert" className={cn("text-sm font-medium text-crit-text", className)} {...props} />;
}
