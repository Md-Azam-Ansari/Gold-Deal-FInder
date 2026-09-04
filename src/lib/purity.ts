/**
 * Purity normalization (spec section 6).
 * Lets the app compare 18K and 22K jewellery on equal footing by converting
 * everything to a pure-metal-equivalent weight.
 */

export const GOLD_PURITY_FRACTIONS: Record<string, number> = {
  "24K": 0.999,
  "22K": 0.916,
  "20K": 0.833,
  "18K": 0.75,
  "14K": 0.585,
  "9K": 0.375,
};

export const SILVER_PURITY_FRACTIONS: Record<string, number> = {
  "999": 0.999,
  "925": 0.925,
};

export function getPurityFraction(metal: "GOLD" | "SILVER", purityLabel: string): number | null {
  const table = metal === "GOLD" ? GOLD_PURITY_FRACTIONS : SILVER_PURITY_FRACTIONS;
  return table[purityLabel] ?? null;
}

/** pureGoldEquivalentWeight = netMetalWeight × purityFraction */
export function calculatePureMetalEquivalent(
  netMetalWeight: number | null,
  metal: "GOLD" | "SILVER",
  purityLabel: string
): number | null {
  if (netMetalWeight == null) return null;
  const fraction = getPurityFraction(metal, purityLabel);
  if (fraction == null) return null;
  return Math.round(netMetalWeight * fraction * 1000) / 1000;
}
