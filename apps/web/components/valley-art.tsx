"use client";

import { motion, useReducedMotion } from "framer-motion";

const PETALS = 24;
const SCENE = "M14 200a186 186 0 0 1 372 0V450a16 16 0 0 1-16 16H30a16 16 0 0 1-16-16Z";

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
          <path d={SCENE} />
        </clipPath>
      </defs>
      <path d="M0 200a200 200 0 0 1 400 0V456a24 24 0 0 1-24 24H24a24 24 0 0 1-24-24Z" fill="var(--arch)" />
      <g clipPath="url(#valley-arch)">
        <motion.g {...rise(0.15, 40)}>
          <g transform="translate(200 188) scale(0.84)" fill="none" stroke="var(--sun)" strokeWidth="2.8" strokeLinecap="round">
            {Array.from({ length: PETALS }, (_, i) => (
              <path key={i} d="M0 -138c13 14 13 30 0 46-13-16-13-32 0-46Z" transform={`rotate(${(360 / PETALS) * i})`} />
            ))}
            <circle r="78" fill="var(--sun)" stroke="none" />
            <path d="M-26 -8 0 24l26-32" stroke="var(--arch)" strokeWidth="8" strokeLinejoin="round" />
          </g>
        </motion.g>
        <motion.path {...rise(0.3, 34)} d="M0 332c70-34 132-30 206 0s132 26 194-6v154H0Z" fill="var(--hill-far)" />
        <motion.path {...rise(0.42, 30)} d="M0 372c86-44 150-24 222 8s118 22 178-8v108H0Z" fill="var(--hill-mid)" />
        <motion.path {...rise(0.54, 26)} d="M0 418c92-40 168-18 236 6s110 10 164-14v70H0Z" fill="var(--hill-near)" />
        <motion.path {...rise(0.66, 22)} d="M0 452c110-30 200-6 290 8 42 6 82 2 110-8v28H0Z" fill="var(--hill-front)" />
      </g>
      <path d={SCENE} fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
    </svg>
  );
}
