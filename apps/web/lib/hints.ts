const SIMULATION_HINTS: Record<string, string> = {
  empty_portfolio: "Add a coin or load the sample portfolio first, then try again.",
  no_target: "Add a coin that has a price, such as ETH or BTC, then try again.",
  no_stablecoin: "Add a stablecoin such as USDT or USDC to your portfolio, then try again.",
  not_diversified: "Add a second coin that is not a stablecoin, then try again.",
  simulation_empty: "Your thresholds are high enough that this made-up move stayed under them. Lower a threshold in Settings and try again.",
  rate_limited: "Wait about a minute before simulating again.",
  unauthenticated: "Your session ended. Start as a guest or sign in, then try again.",
};

export function simulationHint(code: string): string | null {
  return SIMULATION_HINTS[code] ?? null;
}
