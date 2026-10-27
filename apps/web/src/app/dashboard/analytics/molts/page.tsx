"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import apiClient from "@/lib/api";
import { SEMANTIC_COLORS, formatCount, moltRow, type MoltRow, type RankedRow } from "@/lib/analyticsView";
import { CARD, OUTLINE_BTN, TERTIARY } from "@/components/analytics/AnalyticsParts";
import { RankedRows } from "@/components/analytics/Charts";

type LoadStatus = "loading" | "ready" | "error";

function toRows(source: MoltRow[], now: Date): RankedRow[] {
  const max = source.reduce((hi, r) => Math.max(hi, r.count), 0);
  return source.map((r) =>
    moltRow(r.tarantula_id, r.name, r.count, r.last_molted_at || r.last_date, max, now, true),
  );
}

/** Every animal with its molt count and when it last molted. */
export default function AnalyticsMoltsPage() {
  const { user } = useAuth();
  const [molts, setMolts] = useState<MoltRow[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await apiClient.get<MoltRow[]>("/api/v1/analytics/molts", {
        params: { tz_offset_minutes: new Date().getTimezoneOffset() },
      });
      setMolts(Array.isArray(response.data) ? response.data : []);
      setNow(new Date());
      setStatus("ready");
    } catch (err) {
      console.error("Failed to fetch molts:", err);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => toRows(molts, now), [molts, now]);
  const total = molts.reduce((sum, r) => sum + r.count, 0);

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
          <h1 className="text-[26px] font-bold leading-8 text-theme-primary">Molts</h1>
          <div className={`text-[13px] ${TERTIARY}`}>
            {status === "ready" ? `${formatCount(total)} logged` : status === "error" ? "—" : " "}
          </div>
        </div>

        {status === "loading" && (
          <div role="status" aria-label="Loading molts" className={`${CARD} h-64 animate-pulse`} />
        )}

        {status === "error" && (
          <section className={`${CARD} flex flex-col items-center gap-2 px-6 py-10 text-center`}>
            <AlertTriangle size={34} style={{ color: SEMANTIC_COLORS.warning }} aria-hidden />
            <h2 className="text-base font-bold text-theme-primary">We couldn&apos;t load your molts</h2>
            <p className="text-[13px] text-theme-secondary">Your records are fine. This is a connection problem.</p>
            <button type="button" onClick={() => void load()} className={`${OUTLINE_BTN} mt-2`}>
              Try again
            </button>
          </section>
        )}

        {status === "ready" && (
          <section className={`${CARD} flex flex-col gap-3 px-5 py-[18px]`}>
            {rows.length === 0 ? (
              <p className={`text-[13px] ${TERTIARY}`}>No animals yet.</p>
            ) : (
              <RankedRows rows={rows} labelWidth={110} hrefFor={(r) => (r.id ? `/dashboard/inverts/${r.id}` : null)} />
            )}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
