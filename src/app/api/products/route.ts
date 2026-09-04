import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { computePricing, classifyDeal, calculateDealScore } from "@/lib/pricing-engine";

// Never return thousands of products in one request (spec section 29).
const MAX_PAGE_SIZE = 50;

const querySchema = z.object({
  metal: z.enum(["GOLD", "SILVER"]).optional(),
  purity: z.string().optional(),
  retailerSlug: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", details: parsed.error.flatten() }, { status: 400 });
  }
  const { metal, purity, retailerSlug, minPrice, maxPrice, page, pageSize } = parsed.data;

  const where = {
    isExcludedFromComparison: false,
    isInvestmentProduct: false,
    ...(metal ? { metal } : {}),
    ...(purity ? { purity } : {}),
    ...(retailerSlug ? { retailer: { slug: retailerSlug } } : {}),
    ...(minPrice != null || maxPrice != null
      ? { finalPrice: { ...(minPrice != null ? { gte: minPrice } : {}), ...(maxPrice != null ? { lte: maxPrice } : {}) } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      include: { retailer: true, category: true },
      orderBy: { finalPrice: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.product.count({ where }),
  ]);

  // Look up current benchmark rates once, then compute derived fields per product.
  const rates = await db.metalRate.findMany();
  const rateFor = (metal: string, purity: string) =>
    rates.find((r) => r.metal === metal && r.purity === purity)?.rate ?? null;

  const products = rows.map((p) => {
    const benchmarkRatePerGram = rateFor(p.metal, p.purity);
    const pricing = computePricing({
      finalPrice: Number(p.finalPrice),
      makingCharge: p.makingCharge != null ? Number(p.makingCharge) : null,
      netMetalWeight: p.netMetalWeight != null ? Number(p.netMetalWeight) : null,
      benchmarkRatePerGram: benchmarkRatePerGram != null ? Number(benchmarkRatePerGram) : null,
    });
    const classification = classifyDeal(pricing.premiumPercentage, pricing.canCalculate);
    const dealScore = calculateDealScore(
      pricing.premiumPercentage,
      p.makingChargePercentage != null ? Number(p.makingChargePercentage) : null
    );

    return {
      id: p.id,
      retailer: p.retailer.name,
      category: p.category.name,
      productName: p.productName,
      productUrl: p.productUrl,
      metal: p.metal,
      purity: p.purity,
      netMetalWeight: p.netMetalWeight,
      finalPrice: p.finalPrice,
      availability: p.availability,
      isDemoData: p.isDemoData,
      pricing,
      dealClassification: classification,
      dealScore,
    };
  });

  return NextResponse.json({
    data: products,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}
