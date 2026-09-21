export type PriceLow = {
  lowUsd: number;
  lowAt: string | null;
  windowDays: number | null;
  scope: "all_time" | "window";
};
