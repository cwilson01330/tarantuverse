/**
 * Analytics: one page (analytics redesign, README §2-§3). Right now, Collection,
 * Feeding, Molts, Recent, then the Premium block (member cards, a washed-out
 * preview of the keeper's own data, or a grey sample). It replaces the old
 * Analytics + Advanced Analytics screens; `advanced.tsx` redirects here.
 *
 * Requests: every keeper makes ONE analytics call (`/analytics/collection`).
 * Whether the keeper is Premium comes from `/promo-codes/me/limits`; a Premium
 * keeper then also fetches `/analytics/advanced/` (a 402 there switches the
 * Premium block to the preview). Saving the feeding cost refetches only
 * `/advanced/`; pull to refresh refetches both, together.
 *
 * Every word and chart shape comes from `src/lib/analytics-view.ts`; which block
 * shows comes from `src/lib/analytics-page-state.ts` (both unit-tested).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { AppHeader } from '../../src/components/AppHeader';
import UpgradeModal from '../../src/components/UpgradeModal';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { AnalyticsSkeleton } from '../../src/components/analytics/AnalyticsSkeleton';
import { CollectionCard } from '../../src/components/analytics/CollectionCard';
import { FeedingCard } from '../../src/components/analytics/FeedingCard';
import { MoltsCard } from '../../src/components/analytics/MoltsCard';
import { PremiumSection, type PremiumState } from '../../src/components/analytics/PremiumSection';
import { RecentCard } from '../../src/components/analytics/RecentCard';
import { RightNow } from '../../src/components/analytics/RightNow';
import {
  AnalyticsCard,
  MIN_TOUCH,
  ON_PRIMARY,
  OutlineButton,
} from '../../src/components/analytics/parts';
import {
  SEMANTIC_COLORS,
  headerSubtitle,
  type AdvancedAnalytics,
  type CollectionAnalytics,
} from '../../src/lib/analytics-view';
import {
  isStale,
  pageBody,
  planFromLimits,
  planOnLimitsError,
  premiumKind,
  type AdvancedStatus,
  type LoadStatus,
  type PlanState,
} from '../../src/lib/analytics-page-state';
import { UPGRADE_EVENTS, trackUpgrade } from '../../src/lib/upgrade-tracking';
import { isPaymentRequired } from '../../src/utils/errors';
import { SPACING } from '../../src/theme/tokens';

type AdvancedSlot = { status: Exclude<AdvancedStatus, 'ready'> } | { status: 'ready'; data: AdvancedAnalytics };
type FetchMode = 'initial' | 'refresh' | 'silent';

const tzParams = () => ({ tz_offset_minutes: new Date().getTimezoneOffset() });

function AnalyticsScreen() {
  const { colors, layout } = useTheme();
  const { user } = useAuth();
  const iconColor = layout.useGradient ? ON_PRIMARY : colors.textPrimary;

  const [collection, setCollection] = useState<CollectionAnalytics | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [now, setNow] = useState(() => new Date());
  const [plan, setPlan] = useState<PlanState>('unknown');
  const [advanced, setAdvanced] = useState<AdvancedSlot>({ status: 'idle' });
  const [refreshing, setRefreshing] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const fetchedAt = useRef<number | null>(null);
  // Only the newest /collection request may write state (focus and pull-to-refresh can overlap).
  const collectionRequest = useRef(0);
  const hasData = useRef(false);

  // ── /analytics/collection: every keeper, one call ──
  const loadCollection = useCallback(async (mode: FetchMode) => {
    const id = ++collectionRequest.current;
    if (mode === 'initial') setStatus('loading');
    try {
      const response = await apiClient.get<CollectionAnalytics>('/analytics/collection', { params: tzParams() });
      if (id !== collectionRequest.current) return;
      const at = new Date();
      fetchedAt.current = at.getTime();
      hasData.current = true;
      setCollection(response.data);
      setNow(at);
      setStatus('ready');
    } catch (err) {
      if (id !== collectionRequest.current) return;
      console.error('Failed to fetch analytics:', err);
      // A refresh that fails while numbers are on screen keeps them; the first load shows the error card.
      if (!hasData.current) setStatus('error');
    }
  }, []);

  // ── the plan: Premium keepers fetch /advanced/, everyone else sees the preview ──
  const loadPlan = useCallback(async () => {
    try {
      const response = await apiClient.get('/promo-codes/me/limits');
      setPlan(planFromLimits(response.data));
    } catch (err) {
      console.error('Failed to fetch subscription limits:', err);
      // Don't guess "free" (that would show a paying member the paywall on a bad
      // network): let /advanced/ decide. 200 = member, 402 = preview.
      setPlan(planOnLimitsError);
    }
  }, []);

  // ── /analytics/advanced/: a 402 means "not Premium after all" -> the preview ──
  const loadAdvanced = useCallback(async () => {
    // Keep what is on screen during a refresh: the cards, or the preview a 402 already chose.
    setAdvanced((s) => (s.status === 'ready' || s.status === 'gated' ? s : { status: 'loading' }));
    try {
      const response = await apiClient.get<AdvancedAnalytics>('/analytics/advanced/');
      setAdvanced({ status: 'ready', data: response.data });
    } catch (err) {
      if (isPaymentRequired(err)) {
        setAdvanced({ status: 'gated' });
      } else {
        console.error('Failed to fetch advanced analytics:', err);
        setAdvanced((s) => (s.status === 'ready' ? s : { status: 'error' }));
      }
    }
  }, []);

  // The feeding-cost editor: save, then refetch /advanced/ only (README §8).
  // Failures throw to the Money card, which shows its own message.
  const saveFeedingCost = useCallback(async (value: number | null) => {
    await apiClient.put('/analytics/feeding-cost/', { cost_per_feeding: value });
    const response = await apiClient.get<AdvancedAnalytics>('/analytics/advanced/');
    setAdvanced({ status: 'ready', data: response.data });
  }, []);

  useEffect(() => {
    void loadCollection('initial');
    void loadPlan();
  }, [loadCollection, loadPlan]);

  // /advanced/ once per signed-in user (not once per render or per plan refetch).
  const userId = user?.id ?? '';
  const advancedFetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (plan === 'premium' && advancedFetchedFor.current !== userId) {
      advancedFetchedFor.current = userId;
      void loadAdvanced();
    }
  }, [plan, userId, loadAdvanced]);

  // Coming back to the page (from Feeding Day, an animal, the paywall): quietly
  // refetch /collection when it is old, so "Due to eat" is not stale; and re-read
  // the plan if the keeper went to the paywall.
  const visitedPaywall = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (isStale(fetchedAt.current, Date.now())) void loadCollection('silent');
      if (visitedPaywall.current) {
        visitedPaywall.current = false;
        void loadPlan();
      }
    }, [loadCollection, loadPlan]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      loadCollection('refresh'),
      plan === 'premium' ? loadAdvanced() : loadPlan(),
    ]);
    setRefreshing(false);
  }, [loadCollection, loadAdvanced, loadPlan, plan]);

  const ready = status === 'ready' && collection !== null;
  const animals = ready ? collection.total_animals || collection.total_tarantulas : 0;
  const body = pageBody(status, animals);
  const kind = premiumKind({ status, animals, plan, advanced: advanced.status });

  // upgrade_prompt_shown once per page view, when the preview is on screen. Tagged
  // with this page's surface because UpgradeModal fires its own events when it opens.
  const shownTracked = useRef(false);
  useEffect(() => {
    if (kind === 'preview' && !shownTracked.current) {
      shownTracked.current = true;
      trackUpgrade(UPGRADE_EVENTS.shown, 'advanced_analytics', { surface: 'analytics_preview' });
    }
  }, [kind]);

  const handleSeePremium = useCallback(() => {
    trackUpgrade(UPGRADE_EVENTS.clicked, 'advanced_analytics', { surface: 'analytics_preview' });
    visitedPaywall.current = true;
    setUpgradeOpen(true);
  }, []);

  let premium: PremiumState | null = null;
  if (ready && kind) {
    if (kind === 'member' && advanced.status === 'ready') {
      premium = { kind: 'member', advanced: advanced.data, onSaveCost: saveFeedingCost };
    } else if (kind === 'preview') {
      premium = { kind: 'preview', collection, onSeePremium: handleSeePremium };
    } else if (kind === 'error') {
      premium = { kind: 'error', onRetry: () => void loadAdvanced() };
    } else if (kind === 'sample') {
      premium = { kind: 'sample' };
    } else {
      premium = { kind: 'loading' };
    }
  }

  // ── header ──
  const subtitleNode =
    status === 'loading' ? (
      <View
        accessible
        accessibilityLabel="Loading"
        style={{
          height: 12,
          width: 150,
          borderRadius: 6,
          // README: 30% white on the gradient, surfaceElevated on the flat header.
          backgroundColor: layout.useGradient ? 'rgba(255,255,255,0.3)' : colors.surfaceElevated,
        }}
      />
    ) : undefined;
  const subtitle = status === 'error' || !collection ? '—' : headerSubtitle(collection);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)' as never));

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Analytics"
        subtitle={subtitleNode ? undefined : subtitle}
        subtitleNode={subtitleNode}
        leftAction={
          <TouchableOpacity
            onPress={goBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {body === 'loading' && <AnalyticsSkeleton />}

        {body === 'error' && (
          <AnalyticsCard style={styles.centerCard}>
            <MaterialCommunityIcons name="alert-outline" size={34} color={SEMANTIC_COLORS.warning} />
            <Text accessibilityRole="header" style={[styles.centerTitle, { color: colors.textPrimary }]}>
              We couldn&apos;t load your analytics
            </Text>
            <Text style={[styles.centerBody, { color: colors.textSecondary }]}>
              Your records are fine. This is a connection problem.
            </Text>
            <OutlineButton label="Try again" onPress={() => void loadCollection('initial')} />
          </AnalyticsCard>
        )}

        {body === 'empty' && (
          <AnalyticsCard style={styles.centerCard}>
            <MaterialCommunityIcons name="chart-line" size={30} color={colors.accent} />
            <Text accessibilityRole="header" style={[styles.centerTitle, { color: colors.textPrimary }]}>
              Add your first animal and this page starts filling in.
            </Text>
            <Text style={[styles.centerBody, { color: colors.textSecondary }]}>
              Every feeding and molt you log turns into something here: who&apos;s due, how often each animal eats, how
              long between molts.
            </Text>
            <PrimaryButton
              onPress={() => router.push('/add' as never)}
              accessibilityRole="button"
              accessibilityLabel="Add to collection"
              style={[styles.addButton, { borderRadius: layout.radius.sm }]}
            >
              <Text style={styles.addButtonText}>Add to collection</Text>
            </PrimaryButton>
          </AnalyticsCard>
        )}

        {body === 'content' && collection && (
          <>
            <RightNow data={collection} now={now} />
            <CollectionCard data={collection} />
            <FeedingCard data={collection} />
            <MoltsCard data={collection} now={now} />
            <RecentCard data={collection} now={now} />
          </>
        )}

        {premium && <PremiumSection state={premium} now={now} />}
      </ScrollView>

      <UpgradeModal
        source="advanced_analytics"
        visible={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Upgrade to Premium"
        message="Premium unlocks the detail behind these cards, worked out from your own logs."
        feature="Molt timing, growth and what you spend"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  backButton: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, justifyContent: 'center' },
  centerCard: { alignItems: 'center', paddingVertical: SPACING.xxl, gap: SPACING.sm },
  centerTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  centerBody: { fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: SPACING.xs },
  addButton: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: ON_PRIMARY, fontSize: 13, fontWeight: '700' },
});

export default withErrorBoundary(AnalyticsScreen, 'analytics');
