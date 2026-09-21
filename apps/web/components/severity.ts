import { Info, ShieldAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Severity } from "@nemea/shared-types";

export type SeverityMeta = { label: string; icon: LucideIcon; tone: "info" | "warn" | "crit"; stripe: string; soft: string; text: string };

export const SEVERITY: Record<Severity, SeverityMeta> = {
  info: { label: "Info", icon: Info, tone: "info", stripe: "border-info-solid", soft: "bg-info-soft", text: "text-info-text" },
  warning: { label: "Warning", icon: TriangleAlert, tone: "warn", stripe: "border-warn-solid", soft: "bg-warn-soft", text: "text-warn-text" },
  critical: { label: "Critical", icon: ShieldAlert, tone: "crit", stripe: "border-crit-solid", soft: "bg-crit-soft", text: "text-crit-text" },
};
