import { describe, expect, it } from "vitest";
import { TOKEN_ICON_BASE, tokenIconUrl, tokenInitials } from "../lib/token-icon.ts";

describe("token icons", () => {
  it("builds the CoinMarketCap image address from the coin id", () => {
    expect(tokenIconUrl(1)).toBe(`${TOKEN_ICON_BASE}/1.png`);
    expect(tokenIconUrl(3408)).toBe("https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png");
  });

  it("returns null, never a guessed address, for an id that cannot exist", () => {
    for (const bad of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(tokenIconUrl(bad)).toBeNull();
  });

  it("shows up to three letters of the symbol when there is no image", () => {
    expect(tokenInitials("BTC")).toBe("BTC");
    expect(tokenInitials("wstETH")).toBe("WST");
    expect(tokenInitials("$$")).toBe("");
  });
});
