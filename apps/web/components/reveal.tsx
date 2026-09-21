"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

type Props = { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" };

export function Reveal({ children, delay = 0, className, as = "div" }: Props) {
  const Tag = as === "li" ? motion.li : motion.div;
  return (
    <Tag
      className={className}
      initial={{ opacity: 0.5, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Tag>
  );
}
