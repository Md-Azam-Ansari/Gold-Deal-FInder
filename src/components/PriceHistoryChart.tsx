"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { computePriceStats } from "@/lib/price-history";

interface Snapshot {
  finalPrice: number;
  recordedAt: string; // ISO string from the server
}

const RANGES: { label: string; days: number | null }[] = [
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "ALL", days: null },
];

export function PriceHistoryChart({ snapshots, currentPrice }: { snapshots: Snapshot[]; currentPrice: number }) {
  const [rangeIndex, setRangeIndex] = useState(1); // default: 90D

  const parsed = useMemo(
    () =>
      [...snapshots]
        .map((s) => ({ finalPrice: s.finalPrice, recordedAt: new Date(s.recordedAt) }))
        .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()),
    [snapshots]
  );

  const selected = RANGES[rangeIndex];
  const stats = useMemo(
    () => computePriceStats(parsed, currentPrice, selected.days),
    [parsed, currentPrice, selected.days]
  );

  const chartData = useMemo(() => {
    const cutoff = selected.days != null ? new Date(Date.now() - selected.days * 24 * 60 * 60 * 1000) : null;
    return parsed
      .filter((p) => !cutoff || p.recordedAt >= cutoff)
      .map((p) => ({
        date: p.recordedAt.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
        price: p.finalPrice,
      }));
  }, [parsed, selected.days]);

  if (parsed.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
        Not enough price history yet — this product hasn&apos;t been scraped more than once. Check back
        after a few more scraper runs.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex gap-1">
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            onClick={() => setRangeIndex(i)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              i === rangeIndex ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {chartData.length < 2 ? (
        <p className="mt-4 text-sm text-neutral-500">
          Only {chartData.length} data point{chartData.length === 1 ? "" : "s"} in this range — not enough
          to chart a trend yet.
        </p>
      ) : (
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={70} domain={["auto", "auto"]} />
              <Tooltip formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Price"]} />
              <Line type="monotone" dataKey="price" stroke="#B08D2E" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Stat label="Current" value={`₹${stats.current.toLocaleString("en-IN")}`} />
        <Stat label="Lowest" value={stats.lowest != null ? `₹${stats.lowest.toLocaleString("en-IN")}` : "—"} />
        <Stat label="Highest" value={stats.highest != null ? `₹${stats.highest.toLocaleString("en-IN")}` : "—"} />
        <Stat label="Average" value={stats.average != null ? `₹${stats.average.toLocaleString("en-IN")}` : "—"} />
      </div>

      {stats.percentVsAverage != null && stats.dataPointCount >= 2 && (
        <p className="mt-3 text-xs text-neutral-600">
          Current price is{" "}
          <span className={stats.percentVsAverage < 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>
            {Math.abs(stats.percentVsAverage)}% {stats.percentVsAverage < 0 ? "below" : "above"}
          </span>{" "}
          its {selected.label} average.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-neutral-400">{label}</p>
      <p className="font-semibold text-neutral-900">{value}</p>
    </div>
  );
}
