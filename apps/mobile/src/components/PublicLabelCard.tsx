/**
 * PublicLabelCard — shared landing view for enclosure-label deep links
 * (`/t/{id}`, `/i/{id}`, `/col/{id}`).
 *
 * A scanned label can belong to someone else (expos, swaps). The owner's
 * detail screens 404 for a non-owner, so this component first tries the same
 * authenticated getter the detail screen uses. If the viewer can open it, we
 * redirect to the detail screen. Otherwise we fetch the PUBLIC, context-aware
 * profile through apiClient and render it in-app. We never open the website:
 * the universal link would bounce straight back into the app.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, TouchableOpacity, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../services/api';
import { getInvert, INVERT_TAXA, isInvertTaxon } from '../lib/inverts';
import { formatColonyCount, getColony } from '../lib/colonies';
import { getImageUrl } from '../utils/image-url';
import { SPACING } from '../theme/tokens';
import { AppText, Card, Chip, InfoRow } from './ui';

export type LabelKind = 't' | 'i' | 'col';

const DETAIL_ROUTE: Record<LabelKind, string> = {
  t: '/tarantula',
  i: '/invert',
  col: '/colony',
};

interface PublicProfile {
  display_name?: string | null;
  name?: string | null;
  common_name?: string | null;
  scientific_name?: string | null;
  taxon?: string | null;
  sex?: string | null;
  photo_url?: string | null;
  last_feeding?: { date: string } | null;
  last_molt?: { date: string } | null;
  population?: { total: number; is_estimated: boolean } | null;
}

type State =
  | { phase: 'loading' }
  | { phase: 'owner' }
  | { phase: 'public'; profile: PublicProfile }
  | { phase: 'private' }
  | { phase: 'missing' }
  | { phase: 'error' };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export default function PublicLabelCard({ kind, id }: { kind: LabelKind; id: string | undefined }) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { colors, layout } = useTheme();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async (): Promise<State> => {
    if (!id) return { phase: 'missing' };
    if (user) {
      try {
        if (kind === 'col') await getColony(id);
        else await getInvert(id);
        return { phase: 'owner' };
      } catch {
        // 403/404 (someone else's animal) or transient failure: fall through
        // to the public card, which reports its own status.
      }
    }
    try {
      const { data } = await apiClient.get<PublicProfile>(`/${kind}/${id}`);
      return { phase: 'public', profile: data };
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 403) return { phase: 'private' };
      if (status === 404 || status === 400) return { phase: 'missing' };
      return { phase: 'error' };
    }
  }, [id, kind, user]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setState({ phase: 'loading' });
    load().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, load, attempt]);

  if (!id) return <Redirect href="/(tabs)" />;
  if (state.phase === 'owner') return <Redirect href={`${DETAIL_ROUTE[kind]}/${id}` as never} />;

  // Not signed in: /(tabs) would bounce through login, so send them there.
  const goBack = () => router.replace((user ? '/(tabs)' : '/login') as never);
  const backLabel = user ? 'Go to my collection' : 'Go to sign in';

  const container = { flex: 1, backgroundColor: colors.background } as const;

  if (state.phase === 'loading') {
    return (
      <View style={[container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Loading label" />
      </View>
    );
  }

  let body: React.ReactNode;
  if (state.phase === 'public') {
    const p = state.profile;
    const name = p.display_name || p.name || p.common_name || p.scientific_name || 'Unnamed';
    const taxonLabel = p.taxon && isInvertTaxon(p.taxon) ? INVERT_TAXA[p.taxon].label : null;
    const names = [p.scientific_name, p.common_name].filter((n): n is string => !!n && n !== name);
    const photo = p.photo_url ? getImageUrl(p.photo_url) : null;
    body = (
      <Card>
        {photo ? (
          <Image
            source={{ uri: photo }}
            accessibilityLabel={`Photo of ${name}`}
            style={{ width: '100%', aspectRatio: 1, borderRadius: layout.radius.md, backgroundColor: colors.surfaceElevated }}
            resizeMode="cover"
          />
        ) : null}
        <AppText variant="title" accessibilityRole="header">{name}</AppText>
        {names.map((n) => (
          <AppText key={n} variant="body" color="textSecondary" italic={n === p.scientific_name}>{n}</AppText>
        ))}
        {taxonLabel ? (
          <View style={{ flexDirection: 'row' }}>
            <Chip>{taxonLabel}</Chip>
          </View>
        ) : null}
        {p.population ? (
          <InfoRow label="Population" value={formatColonyCount(p.population.total, p.population.is_estimated)} />
        ) : null}
        {p.sex ? <InfoRow label="Sex" value={p.sex.charAt(0).toUpperCase() + p.sex.slice(1)} /> : null}
        {p.last_feeding ? <InfoRow label="Last fed" value={formatDate(p.last_feeding.date)} /> : null}
        {p.last_molt ? <InfoRow label="Last molt" value={formatDate(p.last_molt.date)} /> : null}
        <AppText variant="body" color="textSecondary">Kept by another keeper.</AppText>
      </Card>
    );
  } else {
    const message =
      state.phase === 'private'
        ? 'This collection is private.'
        : state.phase === 'missing'
          ? "This label doesn't match an animal anymore."
          : "Couldn't load this label. Check your connection and try again.";
    body = (
      <Card>
        <AppText variant="heading" accessibilityRole="header">{message}</AppText>
        {state.phase === 'error' ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={() => setAttempt((n) => n + 1)}
            style={{ paddingVertical: SPACING.md, alignItems: 'center' }}
          >
            <AppText variant="bodyStrong" color="primary">Try again</AppText>
          </TouchableOpacity>
        ) : null}
      </Card>
    );
  }

  return (
    <ScrollView style={container} contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.lg, flexGrow: 1, justifyContent: 'center' }}>
      {body}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        onPress={goBack}
        style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: layout.radius.md,
          paddingVertical: SPACING.md,
          alignItems: 'center',
        }}
      >
        <AppText variant="subheading">{backLabel}</AppText>
      </TouchableOpacity>
    </ScrollView>
  );
}
