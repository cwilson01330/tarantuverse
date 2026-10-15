/**
 * Transfer claim landing — https://herpetoverse.com/claim/{token}
 *
 * The Android app link and the iOS universal link (AASA "/claim/*") both open
 * the app here when it's installed. Before this screen existed they landed on
 * expo-router's unmatched-route page and the buyer could never claim on that
 * phone.
 *
 * Mirrors the HV web claim page (apps/web-herpetoverse/src/app/claim/[token]):
 * public preview (identity + plain provenance, never the sale price) → "Claim
 * this animal". Claiming needs an account; a signed-out buyer goes to sign-in
 * with the claim parked (src/lib/claim.ts) so they come straight back here.
 * Claims never hit the free cap (server-side).
 *
 * Theme: ThemeContext colors only; on-primary text is #0B0B0B like every other
 * HV primary button.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../../src/components/AppHeader';
import { HeaderBackButton } from '../../src/components/HeaderBackButton';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { ANIMAL_TAXA, isAnimalTaxon } from '../../src/lib/animals';
import {
  type TransferPreview,
  claimTransfer,
  previewTransfer,
  setPostAuthClaim,
} from '../../src/lib/claim';
import { getErrorMessage } from '../../src/utils/errors';

type Phase = 'loading' | 'ready' | 'claiming' | 'claimed' | 'error';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function ClaimScreen() {
  const { token: rawToken } = useLocalSearchParams<{ token: string }>();
  const token = typeof rawToken === 'string' ? rawToken : '';
  const router = useRouter();
  const { user } = useAuth();
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();

  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!token) {
      setError('This transfer link is invalid.');
      setPhase('error');
      return;
    }
    try {
      const data = await previewTransfer(token);
      setPreview(data);
      setPhase('ready');
    } catch (e: any) {
      setError(
        e?.response?.status === 404
          ? 'This transfer link is invalid.'
          : 'Could not load this transfer. Check your connection and try again.',
      );
      setPhase('error');
    }
  }, [token]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const goHome = () => router.replace('/' as never);
  const goBack = () => (router.canGoBack() ? router.back() : goHome());

  const handleClaim = async () => {
    if (!user) {
      setPostAuthClaim(token);
      router.push('/login' as never);
      return;
    }
    setPhase('claiming');
    setError(null);
    try {
      const created = await claimTransfer(token);
      if (created.kind === 'animal' || !created.kind) {
        router.replace(`/reptile/${created.id}` as never);
      } else {
        // An invert or colony link opened on the Herpetoverse domain. The
        // claim still landed in this account; it just isn't a reptile.
        setPhase('claimed');
      }
    } catch (e: any) {
      setError(getErrorMessage(e, 'Something went wrong claiming this animal. Please try again.'));
      setPhase('ready');
      // The status may have changed underneath us (claimed elsewhere, expired).
      await loadPreview();
    }
  };

  const shell = (children: React.ReactNode) => (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppHeader title="Claim an animal" leftAction={<HeaderBackButton onPress={goBack} />} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        {children}
      </ScrollView>
    </View>
  );

  const message = (icon: keyof typeof MaterialCommunityIcons.glyphMap, text: string) =>
    shell(
      <View style={styles.centerBlock}>
        <MaterialCommunityIcons name={icon} size={40} color={colors.textTertiary} />
        <Text style={[styles.messageText, { color: colors.textPrimary }]}>{text}</Text>
        <TouchableOpacity
          onPress={goHome}
          style={[styles.primaryBtn, { backgroundColor: colors.primary, borderRadius: layout.radius.md }]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>Go to Herpetoverse</Text>
        </TouchableOpacity>
      </View>,
    );

  if (phase === 'loading') {
    return shell(
      <View style={styles.centerBlock}>
        <ActivityIndicator color={colors.primary} />
      </View>,
    );
  }
  if (phase === 'error' || !preview) {
    return message('link-variant-off', error || 'Transfer not found.');
  }
  if (phase === 'claimed') {
    return message('check-circle-outline', 'Claimed — it’s now in your account.');
  }
  if (preview.status !== 'pending') {
    return message(
      'timer-sand-complete',
      preview.status === 'claimed'
        ? 'This animal has already been claimed.'
        : preview.status === 'cancelled'
          ? 'The seller cancelled this transfer.'
          : 'This transfer link has expired.',
    );
  }

  const displayName =
    preview.name || preview.common_name || preview.scientific_name || 'this animal';
  const glyph = isAnimalTaxon(preview.taxon) ? ANIMAL_TAXA[preview.taxon].glyph : '🦎';
  const photo = preview.photo_urls?.[0];
  const sex = preview.sex && preview.sex.toLowerCase() !== 'unknown' ? preview.sex.toLowerCase() : null;
  const claiming = phase === 'claiming';

  return shell(
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg },
      ]}
    >
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={[styles.hero, { borderTopLeftRadius: layout.radius.lg, borderTopRightRadius: layout.radius.lg }]}
          accessibilityLabel={displayName}
        />
      ) : (
        <View
          style={[
            styles.hero,
            styles.heroPlaceholder,
            {
              backgroundColor: colors.surfaceRaised,
              borderTopLeftRadius: layout.radius.lg,
              borderTopRightRadius: layout.radius.lg,
            },
          ]}
        >
          <Text style={styles.heroGlyph} accessibilityElementsHidden importantForAccessibility="no">
            {glyph}
          </Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>You&apos;ve been sent an animal</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
          {displayName}
        </Text>
        {preview.scientific_name ? (
          <Text style={[styles.sci, { color: colors.textSecondary }]}>{preview.scientific_name}</Text>
        ) : null}

        <View style={styles.chips}>
          {sex ? (
            <View style={[styles.chip, { backgroundColor: colors.surfaceRaised }]}>
              <Text style={[styles.chipText, { color: colors.textPrimary }]}>{sex}</Text>
            </View>
          ) : null}
          {preview.breeder_handle ? (
            <View style={[styles.chip, { backgroundColor: colors.surfaceRaised }]}>
              <Text style={[styles.chipText, { color: colors.accent }]}>from @{preview.breeder_handle}</Text>
            </View>
          ) : null}
        </View>

        {preview.note ? (
          <Text
            style={[
              styles.note,
              {
                color: colors.textSecondary,
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderRadius: layout.radius.md,
              },
            ]}
          >
            “{preview.note}”
          </Text>
        ) : null}

        {/* Plain provenance — reptiles & amphibians carry no dam/sire pedigree. */}
        <View style={[styles.provenance, { borderColor: colors.border, borderRadius: layout.radius.md }]}>
          <Text style={[styles.provTitle, { color: colors.textTertiary }]}>PROVENANCE</Text>
          {preview.breeder_handle ? (
            <View style={styles.provRow}>
              <Text style={[styles.provLabel, { color: colors.textTertiary }]}>From</Text>
              <Text style={[styles.provValue, { color: colors.textPrimary }]}>@{preview.breeder_handle}</Text>
            </View>
          ) : null}
          {preview.scientific_name ? (
            <View style={styles.provRow}>
              <Text style={[styles.provLabel, { color: colors.textTertiary }]}>Species</Text>
              <Text style={[styles.provValue, styles.italic, { color: colors.textPrimary }]}>
                {preview.scientific_name}
              </Text>
            </View>
          ) : null}
          {preview.expires_at ? (
            <View style={styles.provRow}>
              <Text style={[styles.provLabel, { color: colors.textTertiary }]}>Link expires</Text>
              <Text style={[styles.provValue, { color: colors.textPrimary }]}>{fmtDate(preview.expires_at)}</Text>
            </View>
          ) : null}
        </View>

        {error ? (
          <Text style={[styles.error, { color: colors.danger }]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={handleClaim}
          disabled={claiming}
          style={[
            styles.primaryBtn,
            { backgroundColor: colors.primary, borderRadius: layout.radius.md, opacity: claiming ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: claiming, busy: claiming }}
        >
          {claiming ? (
            <ActivityIndicator color="#0B0B0B" />
          ) : (
            <Text style={styles.primaryBtnText}>{user ? 'Claim this animal' : 'Sign in to claim'}</Text>
          )}
        </TouchableOpacity>

        {!user ? (
          <TouchableOpacity
            onPress={() => {
              setPostAuthClaim(token);
              router.push('/register' as never);
            }}
            style={styles.secondaryBtn}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
              New here? <Text style={{ color: colors.accent, fontWeight: '700' }}>Create a free account</Text>
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>,
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16 },
  centerBlock: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 16, gap: 16 },
  messageText: { fontSize: 16, fontWeight: '600', textAlign: 'center', lineHeight: 22 },
  card: { borderWidth: 1, overflow: 'hidden' },
  hero: { width: '100%', height: 220 },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  heroGlyph: { fontSize: 64 },
  body: { padding: 20 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 4 },
  title: { fontSize: 24, fontWeight: '700' },
  sci: { fontSize: 15, fontStyle: 'italic', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  note: { marginTop: 16, padding: 12, borderWidth: 1, fontSize: 14, lineHeight: 20 },
  provenance: { marginTop: 16, padding: 12, borderWidth: 1, gap: 6 },
  provTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  provRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  provLabel: { fontSize: 14 },
  provValue: { fontSize: 14, flexShrink: 1, textAlign: 'right' },
  italic: { fontStyle: 'italic' },
  error: { marginTop: 16, fontSize: 14 },
  primaryBtn: {
    marginTop: 20,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  primaryBtnText: { color: '#0B0B0B', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
  secondaryText: { fontSize: 14, textAlign: 'center' },
});

export default withErrorBoundary(ClaimScreen, 'claim');
