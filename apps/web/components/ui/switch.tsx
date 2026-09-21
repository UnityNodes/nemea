"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

export const Switch = React.forwardRef<React.ComponentRef<typeof SwitchPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-line-strong bg-sunken transition-colors duration-200 data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-1 rounded-full bg-muted shadow-sm transition-transform duration-200 ease-[var(--ease-calm)] data-[state=checked]:translate-x-6 data-[state=checked]:bg-on-primary" />
    </SwitchPrimitive.Root>
  );
});
