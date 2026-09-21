"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

type ContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  variant?: "modal" | "sheet";
  title: string;
  description?: string;
  hideTitle?: boolean;
};

export const DialogContent = React.forwardRef<React.ComponentRef<typeof DialogPrimitive.Content>, ContentProps>(function DialogContent(
  { className, children, variant = "modal", title, description, hideTitle = false, ...props },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dlg-overlay fixed inset-0 z-40 bg-[color-mix(in_srgb,var(--ink)_45%,transparent)]" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "dlg-content fixed z-50 flex flex-col border border-line bg-surface text-ink shadow-[var(--shadow-pop)]",
          variant === "modal"
            ? "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[var(--radius-panel)] md:inset-auto md:left-1/2 md:top-1/2 md:w-[min(34rem,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-panel)]"
            : "dlg-sheet inset-y-0 right-0 w-full max-w-[30rem] border-y-0 border-r-0",
          className,
        )}
        {...(description ? {} : { "aria-describedby": undefined })}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className={cn("text-lg font-semibold leading-snug", hideTitle && "sr-only")}>{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description> : null}
          </div>
          <DialogPrimitive.Close
            className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted transition-colors hover:bg-sunken hover:text-ink md:size-9"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
