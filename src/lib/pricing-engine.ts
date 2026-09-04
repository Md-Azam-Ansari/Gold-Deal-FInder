/**
 * Gold Deal Finder — Pricing Engine
 *
 * This is the ONLY place normalized pricing math happens. Retailer scrapers
 * (Phase 4+) must only collect raw fields; every derived number here is
 * auditable from those raw fields, so a user can always see "why" a number
 * is what it is (spec section 33).
 */

export interface RawProductInput {
  finalPrice: number;
  makingCharge: number | null;
  netMetalWeight: number | null; // grams — never grossWeight
  benchmarkRatePerGram: number | null; // current ₹/g for this exact purity
}

export interface PricingResult {
  metalValue: number | null;
  effectivePricePerGram: number | null;
  makingChargePerGram: number | null;
  premiumAmount: number | null;
  premiumPercentage: number | null;
  benchmarkDifference: number | null;
  canCalculate: boolean;
  reason?: string;
}

/** metalValue = currentBenchmarkRateForPurity × netMetalWeight */
export function calculateMetalValue(
  benchmarkRatePerGram: number | null,
  netMetalWeight: number | null
): number | null {
  if (benchmarkRatePerGram == null || netMetalWeight == null) return null;
  return round2(benchmarkRatePerGram * netMetalWeight);
}

/** effectivePricePerGram = finalPrice / netMetalWeight */
export function calculateEffectivePricePerGram(
  finalPrice: number,
  netMetalWeight: number | null
): number | null {
  if (netMetalWeight == null || netMetalWeight <= 0) return null;
  return round2(finalPrice / netMetalWeight);
}

/** makingChargePerGram = makingCharge / netMetalWeight */
export function calculateMakingChargePerGram(
  makingCharge: number | null,
  netMetalWeight: number | null
): number | null {
  if (makingCharge == null || netMetalWeight == null || netMetalWeight <= 0) return null;
  return round2(makingCharge / netMetalWeight);
}

/** premiumAmount = finalPrice - metalValue */
export function calculatePremiumAmount(
  finalPrice: number,
  metalValue: number | null
): number | null {
  if (metalValue == null) return null;
  return round2(finalPrice - metalValue);
}

/** premiumPercentage = ((finalPrice - metalValue) / metalValue) × 100 */
export function calculatePremiumPercentage(
  finalPrice: number,
  metalValue: number | null
): number | null {
  if (metalValue == null || metalValue === 0) return null;
  return round2(((finalPrice - metalValue) / metalValue) * 100);
}

/** benchmarkDifference = effectivePricePerGram - benchmarkComparablePricePerGram */
export function calculateBenchmarkDifference(
  effectivePricePerGram: number | null,
  benchmarkRatePerGram: number | null
): number | null {
  if (effectivePricePerGram == null || benchmarkRatePerGram == null) return null;
  return round2(effectivePricePerGram - benchmarkRatePerGram);
}

/**
 * Runs every calculation for one product. If netMetalWeight is missing,
 * this deliberately returns canCalculate: false rather than a fabricated
 * number (spec section 4 & 25 — "Cannot reliably calculate ₹/g").
 */
export function computePricing(input: RawProductInput): PricingResult {
  const { finalPrice, makingCharge, netMetalWeight, benchmarkRatePerGram } = input;

  if (netMetalWeight == null) {
    return {
      metalValue: null,
      effectivePricePerGram: null,
      makingChargePerGram: null,
      premiumAmount: null,
      premiumPercentage: null,
      benchmarkDifference: null,
      canCalculate: false,
      reason: "Weight information incomplete",
    };
  }

  const metalValue = calculateMetalValue(benchmarkRatePerGram, netMetalWeight);
  const effectivePricePerGram = calculateEffectivePricePerGram(finalPrice, netMetalWeight);
  const makingChargePerGram = calculateMakingChargePerGram(makingCharge, netMetalWeight);
  const premiumAmount = calculatePremiumAmount(finalPrice, metalValue);
  const premiumPercentage = calculatePremiumPercentage(finalPrice, metalValue);
  const benchmarkDifference = calculateBenchmarkDifference(effectivePricePerGram, benchmarkRatePerGram);

  return {
    metalValue,
    effectivePricePerGram,
    makingChargePerGram,
    premiumAmount,
    premiumPercentage,
    benchmarkDifference,
    canCalculate: metalValue != null && effectivePricePerGram != null,
  };
}

// ---------------------------------------------------------------------------
// Deal classification (spec section 10). Thresholds are intentionally simple
// and centralized here so they're easy to tune once real historical data exists.
// ---------------------------------------------------------------------------

export type DealClassification =
  | "EXCEPTIONAL_DEAL"
  | "GREAT_DEAL"
  | "GOOD_DEAL"
  | "FAIR_PRICE"
  | "EXPENSIVE"
  | "VERY_EXPENSIVE"
  | "UNRATED";

export function classifyDeal(premiumPercentage: number | null, canCalculate: boolean): DealClassification {
  if (!canCalculate || premiumPercentage == null) return "UNRATED";
  if (premiumPercentage <= 2) return "EXCEPTIONAL_DEAL";
  if (premiumPercentage <= 6) return "GREAT_DEAL";
  if (premiumPercentage <= 10) return "GOOD_DEAL";
  if (premiumPercentage <= 16) return "FAIR_PRICE";
  if (premiumPercentage <= 25) return "EXPENSIVE";
  return "VERY_EXPENSIVE";
}

/** A 0–100 score for sorting "Best Deal" — lower premium and lower making-charge% score higher. */
export function calculateDealScore(
  premiumPercentage: number | null,
  makingChargePercentage: number | null
): number {
  if (premiumPercentage == null) return 0;
  const premiumScore = Math.max(0, 100 - premiumPercentage * 3);
  const makingScore = makingChargePercentage == null ? 50 : Math.max(0, 100 - makingChargePercentage * 5);
  return round2(premiumScore * 0.7 + makingScore * 0.3);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
