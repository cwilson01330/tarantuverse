"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import apiClient from "@/lib/api";
import { SEMANTIC_COLORS, formatCount, speciesRows, type CollectionAnalytics } from "@/lib/analyticsView";
import { CARD, OUTLINE_BTN, TERTIARY } from "@/components/analytics/AnalyticsParts";
import { RankedRows } from "@/components/analytics/Charts";

type LoadStatus = "loading" | "ready" | "error";

/** Every species in the collection, most animals first, with a search box. */
export default function AnalyticsSpeciesPage() {
  const { user } = useAuth();
  const [data, setData] = useState<CollectionAnalytics | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await apiClient.get<CollectionAnalytics>("/api/v1/analytics/collection", {
        params: { tz_offset_minutes: new Date().getTimezoneOffset() },
      });
      setData(response.data);
      setStatus("ready");
    } catch (err) {
      console.error("Failed to fetch species counts:", err);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Every species, most animals first (no cap), straight from the shared lib.
  const all = useMemo(() => (data ? speciesRows(data, null).rows : []), [data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((r) => !q || r.label.toLowerCase().includes(q));
  }, [all, query]);

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="container mx-auto px-6 pb-10">
        <div className="sticky top-16 z-20 -mx-6 mb-5 bg-gray-50/95 px-6 py-4 backdrop-blur dark:bg-gray-950/95">
          <Link
            href="/dashboard/analytics"
            className="mb-1 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
          >
            <ArrowLeft size={15} aria-hidden />
            Analytics
          </Link>
          <h1 className="text-[26px] font-bold leading-8 text-theme-primary">Species</h1>
          <div className={`text-[13px] ${TERTIARY}`}>
            {status === "ready" ? `${formatCount(all.length)} species` : status === "error" ? "—" : " "}
          </div>
        </div>

        {status === "loading" && (
          <div role="status" aria-label="Loading species" className={`${CARD} h-64 animate-pulse`} />
        )}

        {status === "error" && (
          <section className={`${CARD} flex flex-col items-center gap-2 px-6 py-10 text-center`}>
            <AlertTriangle size={34} style={{ color: SEMANTIC_COLORS.warning }} aria-hidden />
            <h2 className="text-base font-bold text-theme-primary">We couldn&apos;t load your species</h2>
            <p className="text-[13px] text-theme-secondary">Your records are fine. This is a connection problem.</p>
            <button type="button" onClick={() => void load()} className={`${OUTLINE_BTN} mt-2`}>
              Try again
            </button>
          </section>
        )}

        {status === "ready" && (
          <section className={`${CARD} flex flex-col gap-3 px-5 py-[18px]`}>
            {all.length === 0 ? (
              <p className={`text-[13px] ${TERTIARY}`}>No animals yet.</p>
            ) : (
              <>
                <label className="block text-xs font-medium text-theme-secondary">
                  Search species
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search species"
                    className="mt-1 min-h-[44px] w-full rounded-preset-sm border border-solid border-theme bg-surface px-3 text-sm text-theme-primary"
                  />
                </label>
                {rows.length === 0 ? (
                  <p className={`text-[13px] ${TERTIARY}`}>No species match that search.</p>
                ) : (
                  <RankedRows rows={rows} labelWidth="min(220px, 45%)" italic />
                )}
              </>
            )}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
