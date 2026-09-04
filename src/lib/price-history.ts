/**
 * Price history stats (spec section 9). Pure functions — no DB, no
 * framework — so this is safe to use from server components, API routes,
 * or client components alike.
 */

export interface PriceStats {
  current: number;
  lowest: number | null;
  highest: number | null;
  average: number | null;
  percentVsAverage: number | null; // negative = current is below average
  dataPointCount: number;
}

/**
 * `currentPrice` is passed separately rather than derived from the last
 * snapshot — the live Product row is always the authoritative current
 * price, whether or not a new snapshot happened to be written today.
 */
export function computePriceStats(
  snapshots: { finalPrice: number; recordedAt: Date }[],
  currentPrice: number,
  rangeDays: number | null // null = all time
): PriceStats {
  const cutoff = rangeDays != null ? new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000) : null;
  const filtered = cutoff ? snapshots.filter((s) => s.recordedAt >= cutoff) : snapshots;

  if (filtered.length === 0) {
    return { current: currentPrice, lowest: null, highest: null, average: null, percentVsAverage: null, dataPointCount: 0 };
  }

  const prices = filtered.map((s) => s.finalPrice);
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const average = prices.reduce((a, b) => a + b, 0) / prices.length;
  const percentVsAverage = average > 0 ? round2(((currentPrice - average) / average) * 100) : null;

  return {
    current: currentPrice,
    lowest,
    highest,
    average: round2(average),
    percentVsAverage,
    dataPointCount: filtered.length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
