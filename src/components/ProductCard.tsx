import Link from "next/link";
import { Gem } from "lucide-react";

type DealClassification =
  | "EXCEPTIONAL_DEAL" | "GREAT_DEAL" | "GOOD_DEAL"
  | "FAIR_PRICE" | "EXPENSIVE" | "VERY_EXPENSIVE" | "UNRATED";

const BADGE_STYLES: Record<DealClassification, string> = {
  EXCEPTIONAL_DEAL: "bg-emerald-100 text-emerald-800",
  GREAT_DEAL: "bg-emerald-50 text-emerald-700",
  GOOD_DEAL: "bg-amber-50 text-amber-700",
  FAIR_PRICE: "bg-neutral-100 text-neutral-600",
  EXPENSIVE: "bg-red-50 text-red-600",
  VERY_EXPENSIVE: "bg-red-100 text-red-700",
  UNRATED: "bg-neutral-100 text-neutral-500",
};

const BADGE_LABELS: Record<DealClassification, string> = {
  EXCEPTIONAL_DEAL: "EXCEPTIONAL DEAL",
  GREAT_DEAL: "GREAT DEAL",
  GOOD_DEAL: "GOOD DEAL",
  FAIR_PRICE: "FAIR PRICE",
  EXPENSIVE: "EXPENSIVE",
  VERY_EXPENSIVE: "VERY EXPENSIVE",
  UNRATED: "NOT ENOUGH DATA",
};

export interface ProductCardProps {
  id: string;
  retailer: string;
  productName: string;
  netMetalWeight: number | string | null;
  purity: string;
  finalPrice: number | string;
  effectivePricePerGram: number | null;
  makingCharge: number | null;
  metalValue: number | null;
  premiumPercentage: number | null;
  dealClassification: DealClassification;
  productUrl: string;
  isDemoData?: boolean;
}

export function ProductCard(p: ProductCardProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-xs font-medium text-neutral-500">
        <span>{p.retailer}</span>
        {p.isDemoData && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">DEMO DATA</span>}
      </div>

      <Link href={`/products/${p.id}`} className="block">
        <div className="my-3 flex h-28 items-center justify-center rounded-xl bg-[#FAF6EF] text-[#C9A24B]">
          <Gem size={32} />
        </div>

        <h3 className="text-sm font-semibold text-neutral-900 hover:underline">{p.productName}</h3>
      </Link>
      <p className="mt-0.5 text-xs text-neutral-500">
        {p.netMetalWeight ?? "—"}g · {p.purity}
      </p>

      <p className="mt-2 text-lg font-bold text-neutral-900">₹{formatNumber(p.finalPrice)}</p>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-600">
        <div>
          <p className="text-neutral-400">Effective ₹/g</p>
          <p className="font-medium text-neutral-800">
            {p.effectivePricePerGram != null ? `₹${formatNumber(p.effectivePricePerGram)}` : "Cannot calculate"}
          </p>
        </div>
        <div>
          <p className="text-neutral-400">Making charge</p>
          <p className="font-medium text-neutral-800">
            {p.makingCharge != null ? `₹${formatNumber(p.makingCharge)}` : "Unavailable"}
          </p>
        </div>
        <div>
          <p className="text-neutral-400">Metal value</p>
          <p className="font-medium text-neutral-800">
            {p.metalValue != null ? `₹${formatNumber(p.metalValue)}` : "Unavailable"}
          </p>
        </div>
        <div>
          <p className="text-neutral-400">Premium</p>
          <p className="font-medium text-neutral-800">
            {p.premiumPercentage != null ? `${p.premiumPercentage > 0 ? "+" : ""}${p.premiumPercentage}%` : "—"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${BADGE_STYLES[p.dealClassification]}`}>
          {BADGE_LABELS[p.dealClassification]}
        </span>
        <a
          href={p.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-[#B08D2E] hover:underline"
        >
          View Deal →
        </a>
      </div>
    </div>
  );
}

function formatNumber(n: number | string) {
  return Number(n).toLocaleString("en-IN");
}
