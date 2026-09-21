"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { Eye, Leaf, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { useExplain } from "@/lib/queries";

export function ExplainSection({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const explain = useExplain(id, everOpened);
  const reduce = useReducedMotion();

  const toggle = () => {
    setEverOpened(true);
    setOpen((v) => !v);
  };

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.14, delayChildren: reduce ? 0 : 0.05 } },
  };
  const item: Variants = {
    hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.55, ease: [0.16, 1, 0.3, 1] } },
  };

  return (
    <section aria-labelledby="eli5-heading" className="scroll-mt-24">
      <div className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-soft)] sm:p-7">
        <div>
          <h2 id="eli5-heading" className="display text-2xl sm:text-3xl">
            Not sure what this means?
          </h2>
          <p className="mt-2 max-w-xl text-muted">A calm, plain-language explanation of what happened, what it usually means, and what Nemea could not see.</p>
        </div>
        <div>
          <Button size="lg" onClick={toggle} aria-expanded={open} aria-controls="eli5-panel" loading={open && explain.isFetching && !explain.data}>
            <Sparkles className="size-5" aria-hidden />
            {open ? "Hide the explanation" : "Explain like I'm 5"}
          </Button>
        </div>
        <div id="eli5-panel" aria-live="polite">
          <AnimatePresence initial={false}>
            {open ? (
              <motion.div key="panel" initial={reduce ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reduce ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                {explain.isPending || (explain.isFetching && !explain.data) ? (
                  <div className="flex flex-col gap-3 pt-4" aria-busy="true">
                    <p className="text-sm font-medium text-muted">Finding a simple way to say it...</p>
                    <Skeleton className="h-8 w-4/5" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-11/12" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : explain.isError ? (
                  <div role="alert" className="mt-4 rounded-[var(--radius-control)] border border-warn-solid/40 bg-warn-soft p-4 text-warn-text">
                    <p className="font-semibold">{errorMessage(explain.error)}</p>
                    <p className="mt-1 text-sm">Nothing is wrong with your funds. The explanation just could not be prepared right now.</p>
                    <Button variant="secondary" size="sm" className="mt-3" onClick={() => void explain.refetch()} loading={explain.isFetching}>
                      <RefreshCw className="size-4" aria-hidden />
                      Try again
                    </Button>
                  </div>
                ) : explain.data ? (
                  <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col gap-7 pt-5">
                    <motion.h3 variants={item} className="display text-[clamp(1.6rem,3.6vw,2.4rem)]">
                      {explain.data.explanation.headline}
                    </motion.h3>
                    {explain.data.explanation.sections.map((section) => (
                      <motion.div key={section.heading} variants={item} className="border-l-2 border-primary/50 pl-4">
                        <h4 className="text-base font-bold">{section.heading}</h4>
                        <p className="mt-1.5 max-w-[62ch] text-[1.02rem] leading-relaxed">{section.body}</p>
                      </motion.div>
                    ))}
                    <motion.div variants={item} className="rounded-[var(--radius-control)] bg-sunken p-4">
                      <h4 className="flex items-center gap-2 text-base font-bold">
                        <Eye className="size-4.5" aria-hidden />
                        What we couldn&apos;t check
                      </h4>
                      {explain.data.explanation.dataGaps.length > 0 ? (
                        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[0.97rem] marker:text-muted">
                          {explain.data.explanation.dataGaps.map((gap) => (
                            <li key={gap}>{gap}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1.5 text-[0.97rem] text-muted">Nemea had the data it needed for this explanation. Nothing was missing.</p>
                      )}
                    </motion.div>
                    <motion.div variants={item} className="flex items-start gap-3 rounded-[var(--radius-control)] bg-safe-soft p-4 text-safe-text sm:p-5">
                      <Leaf className="mt-0.5 size-5 shrink-0" aria-hidden />
                      <p className="text-[1.02rem] leading-relaxed">{explain.data.explanation.calmNote}</p>
                    </motion.div>
                  </motion.div>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
