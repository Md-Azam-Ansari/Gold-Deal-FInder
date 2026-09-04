import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { computePricing, classifyDeal } from "@/lib/pricing-engine";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const product = await db.product.findUnique({
    where: { id },
    include: {
      retailer: true,
      category: true,
      images: true,
      priceSnapshots: { orderBy: { recordedAt: "asc" } },
    },
  });
  if (!product) notFound();

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
  const primaryImage = product.images.find((img) => img.isPrimary) ?? product.images[0];

  return (
    <main className="min-h-screen bg-[#FBF8F2] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-xs text-neutral-500 hover:underline">
          ← Back to deals
        </Link>

        <div className="mt-4 flex items-center justify-between text-xs font-medium text-neutral-500">
          <span>{product.retailer.name}</span>
          {product.isDemoData && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">DEMO DATA</span>
          )}
        </div>

        {primaryImage ? (
          // Plain <img>, not next/image — product images come from arbitrary
          // retailer CDNs; next/image would need every domain allow-listed
          // in next.config.js. Fine for a personal project at this scale.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primaryImage.imageUrl}
            alt={product.productName}
            className="mt-3 h-64 w-full rounded-xl object-cover"
          />
        ) : (
          <div className="mt-3 flex h-48 items-center justify-center rounded-xl bg-[#FAF6EF] text-sm text-[#C9A24B]">
            No image available
          </div>
        )}

        <h1 className="mt-4 text-xl font-bold text-neutral-900">{product.productName}</h1>
        <p className="text-sm text-neutral-500">
          {product.netMetalWeight != null ? `${product.netMetalWeight}g` : "Weight unavailable"} · {product.purity}
        </p>

        <p className="mt-3 text-2xl font-bold text-neutral-900">
          ₹{Number(product.finalPrice).toLocaleString("en-IN")}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Detail
            label="Effective ₹/g"
            value={pricing.effectivePricePerGram != null ? `₹${pricing.effectivePricePerGram.toLocaleString("en-IN")}` : "Cannot calculate"}
          />
          <Detail
            label="Metal value"
            value={pricing.metalValue != null ? `₹${pricing.metalValue.toLocaleString("en-IN")}` : "Unavailable"}
          />
          <Detail
            label="Making charge"
            value={product.makingCharge != null ? `₹${Number(product.makingCharge).toLocaleString("en-IN")}` : "Unavailable"}
          />
          <Detail
            label="Premium"
            value={pricing.premiumPercentage != null ? `${pricing.premiumPercentage > 0 ? "+" : ""}${pricing.premiumPercentage}%` : "—"}
          />
        </div>

        <p className="mt-3 text-xs text-neutral-500">Deal rating: {dealClassification.replace(/_/g, " ")}</p>

        {product.dataQualityWarnings.length > 0 && (
          <p className="mt-2 text-xs text-amber-600">Data quality notes: {product.dataQualityWarnings.join(", ")}</p>
        )}

        <a
          href={product.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          View Deal on {product.retailer.name} →
        </a>

        <h2 className="mt-8 text-sm font-semibold text-neutral-900">Price History</h2>
        <div className="mt-2">
          <PriceHistoryChart
            snapshots={product.priceSnapshots.map((s) => ({
              finalPrice: Number(s.finalPrice),
              recordedAt: s.recordedAt.toISOString(),
            }))}
            currentPrice={Number(product.finalPrice)}
          />
        </div>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="font-medium text-neutral-800">{value}</p>
    </div>
  );
}
