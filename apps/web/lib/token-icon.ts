export const TOKEN_ICON_BASE = "https://s2.coinmarketcap.com/static/img/coins/64x64";

export function tokenIconUrl(cmcId: number): string | null {
  return Number.isSafeInteger(cmcId) && cmcId > 0 ? `${TOKEN_ICON_BASE}/${cmcId}.png` : null;
}

export function tokenInitials(symbol: string): string {
  return symbol.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase();
}
