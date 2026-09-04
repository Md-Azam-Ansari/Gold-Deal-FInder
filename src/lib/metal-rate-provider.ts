/**
 * Live gold/silver rate provider (spec section 7).
 *
 * Uses gold-api.com's real-time endpoint — free, no API key, no rate limit,
 * and it returns spot price directly in INR so no separate forex call is needed.
 * https://gold-api.com/llms.txt has the full (unauthenticated) contract.
 *
 * XAU/XAG spot price represents ~99.9% pure metal. We treat that as the
 * "pure metal ₹/gram" baseline and apply the SAME purity fractions the
 * pricing engine already trusts (src/lib/purity.ts) to get every karat/fineness —
 * so there's only one source of truth for purity math in the whole app.
 */
import { GOLD_PURITY_FRACTIONS, SILVER_PURITY_FRACTIONS } from "./purity";

const TROY_OUNCE_IN_GRAMS = 31.1034768;
const SOURCE_NAME = "gold-api.com (XAU/XAG international spot, INR) + India duty/GST adjustment";

/**
 * gold-api.com returns the raw INTERNATIONAL spot price — it has no concept
 * of Indian import duty or GST, so used alone it reads well below what any
 * Indian retailer, jeweller association, or "today's gold rate" site quotes.
 *
 * As of the May 2026 duty hike, India's gold/silver import duty stack is
 * ~15% Basic Customs Duty + 1% Agriculture Infrastructure & Development Cess
 * + 0.25% Social Welfare Surcharge, and retail sales additionally carry 3%
 * GST on top of that duty-inclusive value — a combined stack of ~19%,
 * confirmed against multiple August 2026 sources. This constant applies
 * that stack so our benchmark matches what Indian buyers actually see
 * quoted, rather than the international wholesale price.
 *
 * Government duty policy has changed more than once in 2026 alone — if the
 * gap between this app's benchmark and real quoted Indian rates drifts
 * again, this is the number to revisit first.
 */
const INDIA_DUTY_AND_GST_MULTIPLIER = 1.19;

interface SpotPriceResponse {
  currency: string;
  price: number;
  symbol: string;
  updatedAt: string;
}

export interface MetalRateQuote {
  metal: "GOLD" | "SILVER";
  purity: string;
  ratePerGram: number;
  source: string;
}

async function fetchSpotPrice(symbol: "XAU" | "XAG"): Promise<SpotPriceResponse> {
  const res = await fetch(`https://api.gold-api.com/price/${symbol}/INR`, {
    cache: "no-store", // never present stale data as live (spec section 7)
  });
  if (!res.ok) {
    throw new Error(`gold-api.com returned ${res.status} for ${symbol}`);
  }
  return res.json();
}

/** Fetches live gold + silver spot prices and expands them into every purity we track. */
export async function fetchLiveMetalRates(): Promise<MetalRateQuote[]> {
  const [goldSpot, silverSpot] = await Promise.all([
    fetchSpotPrice("XAU"),
    fetchSpotPrice("XAG"),
  ]);

  const pureGoldPerGram = (goldSpot.price / TROY_OUNCE_IN_GRAMS) * INDIA_DUTY_AND_GST_MULTIPLIER;
  const pureSilverPerGram = (silverSpot.price / TROY_OUNCE_IN_GRAMS) * INDIA_DUTY_AND_GST_MULTIPLIER;

  const goldRates: MetalRateQuote[] = Object.entries(GOLD_PURITY_FRACTIONS).map(([purity, fraction]) => ({
    metal: "GOLD" as const,
    purity,
    ratePerGram: round2(pureGoldPerGram * fraction),
    source: SOURCE_NAME,
  }));

  const silverRates: MetalRateQuote[] = Object.entries(SILVER_PURITY_FRACTIONS).map(([purity, fraction]) => ({
    metal: "SILVER" as const,
    purity,
    ratePerGram: round2(pureSilverPerGram * fraction),
    source: SOURCE_NAME,
  }));

  return [...goldRates, ...silverRates];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
