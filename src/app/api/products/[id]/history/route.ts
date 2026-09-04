import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const querySchema = z.object({
  range: z.enum(["30", "90", "180", "365", "all"]).default("all"),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }
  const { range } = parsed.data;

  const product = await db.product.findUnique({ where: { id }, select: { id: true } });
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cutoff = range === "all" ? undefined : new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000);

  const snapshots = await db.productPriceSnapshot.findMany({
    where: { productId: id, ...(cutoff ? { recordedAt: { gte: cutoff } } : {}) },
    orderBy: { recordedAt: "asc" },
  });

  return NextResponse.json({
    data: snapshots.map((s) => ({
      recordedAt: s.recordedAt,
      finalPrice: s.finalPrice,
      effectivePricePerGram: s.effectivePricePerGram,
      benchmarkRateAtSnapshot: s.benchmarkRateAtSnapshot,
      availability: s.availability,
    })),
  });
}
