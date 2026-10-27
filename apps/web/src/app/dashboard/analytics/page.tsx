"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, LineChart, Ruler } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import UpgradeModal from "@/components/UpgradeModal";
import { useUnits } from "@/components/UnitsProvider";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import apiClient from "@/lib/api";
import { UPGRADE_EVENTS, trackUpgrade } from "@/lib/upgrade-tracking";
import {
  SEMANTIC_COLORS,
  headerSubtitle,
  relativeLong,
  type AdvancedAnalytics,
  type CollectionAnalytics,
} from "@/lib/analyticsView";
import { CARD, OUTLINE_BTN, PRIMARY_BTN, TERTIARY } from "@/components/analytics/AnalyticsParts";
import AnalyticsSkeleton from "@/components/analytics/AnalyticsSkeleton";
import CollectionCard from "@/components/analytics/CollectionCard";
import FeedingCard from "@/components/analytics/FeedingCard";
import MoltsCard from "@/components/analytics/MoltsCard";
import PremiumSection, { type PremiumState } from "@/components/analytics/PremiumSection";
import RecentCard from "@/components/analytics/RecentCard";
import RightNow from "@/components/analytics/RightNow";

type LoadStatus = "loading" | "ready" | "error";
type AdvancedSlot =
  | { status: "idle" | "loading" | "gated" | "error" }
  | { status: "ready"; data: AdvancedAnalytics };

const tzParams = () => ({ tz_offset_minutes: new Date().getTimezoneOffset() });

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <section className={`${CARD} flex flex-col items-center gap-2 px-6 py-10 text-center`}>
      <AlertTriangle size={34} style={{ color: SEMANTIC_COLORS.warning }} aria-hidden />
      <h2 className="text-base font-bold text-theme-primary">We couldn&apos;t load your analytics</h2>
      <p className="max-w-xs text-[13px] text-theme-secondary">
        Your records are fine. This is a connection problem.
      </p>
      <button type="button" onClick={onRetry} className={`${OUTLINE_BTN} mt-2`}>
        Try again
      </button>
    </section>
  );
}

function EmptyCard() {
  return (
    <section className={`${CARD} flex flex-col items-center gap-2 px-6 py-10 text-center`}>
      <LineChart size={30} className="text-primary" aria-hidden />
      <h2 className="max-w-md text-base font-bold text-theme-primary">
        Add your first animal and this page starts filling in.
      </h2>
      <p className="max-w-md text-[13px] text-theme-secondary">
        Every feeding and molt you log turns into something here: who&apos;s due, how often each animal eats, how long
        between molts.
      </p>
      {/* The collection page carries the add menu for every taxon. */}
      <Link href="/dashboard/tarantulas?add=1" className={`${PRIMARY_BTN} mt-2`}>
        Add to collection
      </Link>
    </section>
  );
}

export default function AnalyticsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { units } = useUnits();
  const { isPremium, limits } = useSubscription();

  const [collection, setCollection] = useState<CollectionAnalytics | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [advanced, setAdvanced] = useState<AdvancedSlot>({ status: "idle" });
  const [now, setNow] = useState(() => new Date());
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // ── /analytics/collection: every keeper, one call ──
  const loadCollection = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await apiClient.get<CollectionAnalytics>("/api/v1/analytics/collection", {
        params: tzParams(),
      });
      const at = new Date();
      setCollection(response.data);
      setFetchedAt(at);
      setNow(at);
      setStatus("ready");
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
      setStatus("error");
    }
  }, []);

  // ── /analytics/advanced/: Premium keepers only. A 402 means "not Premium after all" -> the preview. ──
  const loadAdvanced = useCallback(async () => {
    setAdvanced({ status: "loading" });
    try {
      const response = await apiClient.get<AdvancedAnalytics>("/api/v1/analytics/advanced/");
      setAdvanced({ status: "ready", data: response.data });
    } catch (err: any) {
      if (err?.response?.status === 402) {
        setAdvanced({ status: "gated" });
      } else {
        console.error("Failed to fetch advanced analytics:", err);
        setAdvanced({ status: "error" });
      }
    }
  }, []);

  // Change on the feeding cost: save, then refetch /advanced/ only (README §8).
  // Errors reach the Money card, which shows its own message.
  const saveFeedingCost = useCallback(async (value: number | null) => {
    await apiClient.put("/api/v1/analytics/feeding-cost/", { cost_per_feeding: value });
    const response = await apiClient.get<AdvancedAnalytics>("/api/v1/analytics/advanced/");
    setAdvanced({ status: "ready", data: response.data });
  }, []);

  useEffect(() => {
    void loadCollection();
  }, [loadCollection]);

  // Premium is known once the session and the plan have both answered; until
  // then the Premium slot is a skeleton, so a member never sees the preview flash.
  // `subLoading` is left out on purpose: useSubscription refetches whenever the
  // session token renews and keeps `limits` while it does, so waiting on it would
  // flash the skeleton and unmount an open feeding-cost editor.
  const planKnown = !authLoading && limits !== null;
  // /advanced/ is fetched once per signed-in user, not once per token object.
  const userId = user?.id ?? "";
  const advancedFetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (planKnown && isPremium && advancedFetchedFor.current !== userId) {
      advancedFetchedFor.current = userId;
      void loadAdvanced();
    }
  }, [planKnown, isPremium, userId, loadAdvanced]);

  // "updated just now" / "3 minutes ago" follows the clock.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const ready = status === "ready" && collection !== null;
  const animals = ready ? collection.total_animals || collection.total_tarantulas : 0;
  const noAnimals = ready && animals === 0;

  // What the Premium slot shows.
  let premium: PremiumState | null = null;
  if (ready) {
    const showPreview = (): PremiumState =>
      noAnimals
        ? { kind: "sample" }
        : { kind: "preview", collection, onSeePremium: () => handleSeePremium() };
    if (!planKnown) premium = { kind: "loading" };
    else if (!isPremium) premium = showPreview();
    else if (advanced.status === "ready") {
      premium = { kind: "member", advanced: advanced.data, onSaveCost: saveFeedingCost };
    } else if (advanced.status === "gated") premium = showPreview();
    else if (advanced.status === "error") premium = { kind: "error", onRetry: () => void loadAdvanced() };
    else premium = { kind: "loading" };
  }

  // upgrade_prompt_shown once per page view, when the preview is on screen.
  const shownTracked = useRef(false);
  const previewVisible = premium?.kind === "preview";
  useEffect(() => {
    if (previewVisible && !shownTracked.current) {
      shownTracked.current = true;
      trackUpgrade(UPGRADE_EVENTS.shown, "advanced_analytics", { surface: "analytics_preview" });
    }
  }, [previewVisible]);

  function handleSeePremium() {
    trackUpgrade(UPGRADE_EVENTS.clicked, "advanced_analytics", { surface: "analytics_preview" });
    setUpgradeOpen(true);
  }

  // /dashboard/analytics#premium (the old Advanced page redirects here): the
  // section only exists once the data has loaded, so scroll to it then.
  const scrolledToPremium = useRef(false);
  useEffect(() => {
    if (premium && !scrolledToPremium.current && window.location.hash === "#premium") {
      scrolledToPremium.current = true;
      document.getElementById("premium")?.scrollIntoView({ block: "start" });
    }
  }, [premium]);

  // ── header ──
  let subtitle: ReactNode;
  if (status === "loading") {
    subtitle = <span className="mt-1 block h-3 w-40 rounded bg-surface-elevated" aria-label="Loading" />;
  } else if (!ready) {
    subtitle = "—";
  } else {
    // Zero animals: just "No animals yet" (README), no "updated" tail.
    subtitle =
      fetchedAt && !noAnimals
        ? `${headerSubtitle(collection)} · updated ${relativeLong(fetchedAt.toISOString(), now)}`
        : headerSubtitle(collection);
  }

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="container mx-auto px-6 pb-10">
        {/* Sticky title: stays under the top bar while the page scrolls. */}
        <div className="sticky top-16 z-20 -mx-6 mb-5 bg-gray-50/95 px-6 py-4 backdrop-blur dark:bg-gray-950/95">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div>
              <h1 className="text-[26px] font-bold leading-8 text-theme-primary">Analytics</h1>
              <div className={`text-[13px] ${TERTIARY}`} aria-live="polite">
                {subtitle}
              </div>
            </div>
            <div className={`flex items-center gap-2 text-xs ${TERTIARY}`}>
              <Ruler size={15} aria-hidden />
              {units === "metric" ? "Centimeters" : "Inches"} · grams · your currency
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {status === "loading" && <AnalyticsSkeleton />}

          {status === "error" && <ErrorCard onRetry={() => void loadCollection()} />}

          {ready && noAnimals && <EmptyCard />}

          {ready && !noAnimals && (
            <>
              <RightNow data={collection} now={now} />
              <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2">
                <div className="flex flex-col gap-3.5">
                  <CollectionCard data={collection} />
                  <RecentCard data={collection} now={now} />
                </div>
                <div className="flex flex-col gap-3.5">
                  <FeedingCard data={collection} />
                  <MoltsCard data={collection} now={now} />
                </div>
              </div>
            </>
          )}

          {premium && <PremiumSection state={premium} now={now} />}
        </div>
      </div>

      <UpgradeModal
        isOpen={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        source="advanced_analytics"
        feature="Molt timing, growth and what you spend"
        description="Premium unlocks the detail behind these cards, worked out from your own logs."
      />
    </DashboardLayout>
  );
}
