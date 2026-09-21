import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] text-[0.95rem] font-semibold transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease-calm)] active:translate-y-px disabled:pointer-events-none disabled:opacity-55 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary hover:bg-primary-hover",
        secondary: "border border-line-strong bg-surface text-ink hover:bg-sunken",
        ghost: "text-ink hover:bg-sunken",
        subtle: "bg-safe-soft text-safe-text hover:brightness-[0.97]",
        danger: "border border-crit-solid/50 bg-surface text-crit-text hover:bg-crit-soft",
        link: "h-auto min-h-0 rounded-md px-0 text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary",
      },
      size: {
        md: "h-11 px-5",
        sm: "h-11 px-4 text-sm md:h-9 md:px-3.5",
        lg: "h-12 px-6 text-base",
        icon: "size-11 md:size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button ref={ref} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
      {children}
    </button>
  );
});
