import type { AlertRecord } from "@nemea/shared-types";

export type DeliveryView = {
  alertId: string;
  channel: "telegram" | "email" | "push";
  status: "sent" | "failed" | "skipped";
  detail: string;
  at: string;
};

export type AlertsResponse = {
  alerts: AlertRecord[];
  deliveries: DeliveryView[];
  week: { count: number; cap: number; lastAt: string | null };
};

export type AlertResponse = {
  alert: AlertRecord;
  deliveries: DeliveryView[];
};
