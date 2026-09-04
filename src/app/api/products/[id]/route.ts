import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computePricing, classifyDeal, calculateDealScore } from "@/lib/pricing-engine";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const product = await db.product.findUnique({
    where: { id },
    include: { retailer: true, category: true, images: true },
  });
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rate = await db.metalRate.findUnique({
    where: { metal_purity: { metal: product.metal, purity: product.purity } },
  });

  const pricing = computePricing({
    finalPrice: Number(product.finalPrice),
    makingCharge: product.makingCharge != null ? Number(product.makingCharge) : null,
    netMetalWeight: product.netMetalWeight != null ? Number(product.netMetalWeight) : null,
    benchmarkRatePerGram: rate ? Number(rate.rate) : null,
  });
  const dealClassification = classifyDeal(pricing.premiumPercentage, pricing.canCalculate);
  const dealScore = calculateDealScore(
    pricing.premiumPercentage,
    product.makingChargePercentage != null ? Number(product.makingChargePercentage) : null
  );

  return NextResponse.json({
    data: {
      id: product.id,
      retailer: product.retailer.name,
      category: product.category.name,
      productName: product.productName,
      productUrl: product.productUrl,
      imageUrl: product.images.find((img) => img.isPrimary)?.imageUrl ?? product.images[0]?.imageUrl ?? null,
      metal: product.metal,
      purity: product.purity,
      netMetalWeight: product.netMetalWeight,
      makingCharge: product.makingCharge,
      finalPrice: product.finalPrice,
      availability: product.availability,
      isDemoData: product.isDemoData,
      dataQualityWarnings: product.dataQualityWarnings,
      pricing,
      dealClassification,
      dealScore,
    },
  });
}
