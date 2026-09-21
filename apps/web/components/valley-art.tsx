"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ARCH_PATH, CHEVRON_PATH, HILLS, PETALS, PETAL_PATH, SCENE_PATH, SUN_TRANSFORM } from "@/lib/valley-geometry";

export function ValleyArt({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const rise = (delay: number, distance: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: distance },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 1.1, delay, ease: [0.16, 1, 0.3, 1] as const },
        };
  return (
    <svg viewBox="0 0 400 480" className={className} role="img" aria-label="Illustration: a stone arch opening onto green hills, with a sun shaped like a lion's mane rising behind them.">
      <defs>
        <clipPath id="valley-arch">
          <path d={SCENE_PATH} />
        </clipPath>
      </defs>
      <path d={ARCH_PATH} fill="var(--arch)" />
      <g clipPath="url(#valley-arch)">
        <motion.g {...rise(0.15, 40)}>
          <g transform={SUN_TRANSFORM} fill="none" stroke="var(--sun)" strokeWidth="2.8" strokeLinecap="round">
            {Array.from({ length: PETALS }, (_, i) => (
              <path key={i} d={PETAL_PATH} transform={`rotate(${(360 / PETALS) * i})`} />
            ))}
            <circle r="78" fill="var(--sun)" stroke="none" />
            <path d={CHEVRON_PATH} stroke="var(--arch)" strokeWidth="8" strokeLinejoin="round" />
          </g>
        </motion.g>
        {HILLS.map((hill) => (
          <motion.path key={hill.token} {...rise(hill.delay, hill.rise)} d={hill.d} fill={`var(--${hill.token})`} />
        ))}
      </g>
      <path d={SCENE_PATH} fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
    </svg>
  );
}
