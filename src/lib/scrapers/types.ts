/**
 * Shared scraper contract (spec section 2). Every retailer adapter implements
 * RetailerScraper; the core app (scripts/run-scraper.ts) never contains
 * retailer-specific parsing logic — only this interface.
 */

export type ProductCategoryName =
  | "RING" | "CHAIN" | "NECKLACE" | "BRACELET" | "BANGLE" | "EARRING"
  | "PENDANT" | "ANKLET" | "NOSE_PIN" | "MANGALSUTRA" | "OTHER_JEWELLERY"
  | "GOLD_COIN" | "GOLD_BAR" | "SILVER_COIN" | "SILVER_BAR";

export interface CategoryTarget {
  url: string;
  category: ProductCategoryName;
}

export interface NormalizedScrapedProduct {
  retailerProductId: string;
  productName: string;
  productUrl: string;
  imageUrl: string | null;
  metal: "GOLD" | "SILVER";
  purity: string | null; // e.g. "22K" — null if not disclosed on the page
  netMetalWeight: number | null; // grams — null if not disclosed
  finalPrice: number;
  isExcludedFromComparison: boolean;
  exclusionReason: string | null;
  dataQualityWarnings: string[];
}

export interface RetailerScraper {
  retailerSlug: string;
  retailerName: string;
  categoryTargets: CategoryTarget[];
  /** Returns product detail page URLs found on one category/listing page. */
  scrapeCategory(categoryUrl: string): Promise<string[]>;
  /** Fetches and normalizes one product page. Returns null if the page can't be parsed at all. */
  scrapeProduct(productUrl: string, category: ProductCategoryName): Promise<NormalizedScrapedProduct | null>;
}
