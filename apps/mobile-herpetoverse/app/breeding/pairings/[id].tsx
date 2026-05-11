/**
 * Pairing detail route — Sprint 5a stub.
 *
 * Tapping a row from the breeding tab lands here. Today this screen
 * fetches the pairing record + clutch list and shows a read-only
 * summary; Sprint 5b/5c upgrade it with outcome-editing, clutch
 * creation, and inline offspring rendering.
 *
 * Even as a stub this is genuinely useful — keepers can verify their
 * web-created pairings synced to mobile, and they can browse parent
 * names + status without leaving the app.
 *
 * Hermes-prod safety: static JSX branches only.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../src/components/AppHeader';
import { HeaderBackButton } from '../../../src/components/HeaderBackButton';
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { useTheme } from '../../../src/contexts/ThemeContext';
import {
  PAIRING_OUTCOME_LABEL,
  PAIRING_TYPE_LABEL,
  type Clutch,
  type ReptilePairing,
  getPairing,
  listClutchesForPairing,
} from '../../../src/lib/breeding';

function PairingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();
  const [pairing, setPairing] = useState<ReptilePairing | null>(null);
  const [clutches, setClutches] = useState<Clutch[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [p, c] = await Promise.all([
          getPairing(id as string),
          listClutchesForPairing(id as string).catch(() => [] as Clutch[]),
        ]);
        if (cancelled) return;
        setPairing(p);
        setClutches(c);
      } catch (err: any) {
        if (cancelled) return;
        setLoadError(
          err?.response?.data?.detail ||
            err?.message ||
            "Couldn't load this pairing.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title="Pairing" leftAction={<HeaderBackButton />} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {pairing === null && !loadError && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.textTertiary} />
          </View>
        )}

        {loadError && (
          <View
            style={[
              styles.errorBlock,
              {
                borderColor: 'rgba(239,68,68,0.4)',
                backgroundColor: 'rgba(239,68,68,0.12)',
                borderRadius: layout.radius.md,
              },
            ]}
          >
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        )}

        {pairing && (
          <>
            <View
              style={[
                styles.heroCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: layout.radius.md,
                },
              ]}
            >
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                <Text style={styles.male}>♂ </Text>
                {pairing.male_display_name ?? 'Male'}
                <Text style={styles.dim}>  ×  </Text>
                <Text style={styles.female}>♀ </Text>
                {pairing.female_display_name ?? 'Female'}
              </Text>
              <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>
                {pairing.taxon === 'snake' ? '🐍 Snake pairing' : '🦎 Lizard pairing'}
              </Text>
              <View style={styles.kvGrid}>
                <KV label="Paired" value={fmtDate(pairing.paired_date)} />
                {pairing.separated_date && (
                  <KV
                    label="Separated"
                    value={fmtDate(pairing.separated_date)}
                  />
                )}
                <KV
                  label="Type"
                  value={PAIRING_TYPE_LABEL[pairing.pairing_type]}
                />
                <KV
                  label="Outcome"
                  value={PAIRING_OUTCOME_LABEL[pairing.outcome]}
                />
                <KV
                  label="Visibility"
                  value={pairing.is_private ? '🔒 Private' : '🌐 Public'}
                />
              </View>
              {pairing.notes && (
                <Text
                  style={[styles.notes, { color: colors.textSecondary }]}
                >
                  {pairing.notes}
                </Text>
              )}
            </View>

            <View>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                CLUTCHES
              </Text>
              {clutches === null ? (
                <ActivityIndicator color={colors.textTertiary} />
              ) : clutches.length === 0 ? (
                <View
                  style={[
                    styles.emptyCard,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      borderRadius: layout.radius.md,
                    },
                  ]}
                >
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No clutches recorded for this pairing yet. Clutch
                    tracking on mobile arrives in the next sprint — for
                    now use the web app to record laid dates and
                    incubation conditions.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {clutches.map((c) => (
                    <View
                      key={c.id}
                      style={[
                        styles.clutchRow,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.surface,
                          borderRadius: layout.radius.md,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="egg-easter"
                        size={18}
                        color={colors.primary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.clutchTitle, { color: colors.textPrimary }]}
                        >
                          Laid {fmtDate(c.laid_date)}
                        </Text>
                        <Text
                          style={[styles.clutchMeta, { color: colors.textTertiary }]}
                        >
                          {c.expected_count != null
                            ? `${c.expected_count} expected`
                            : ''}
                          {c.expected_count != null &&
                          c.hatched_count != null
                            ? ' · '
                            : ''}
                          {c.hatched_count != null
                            ? `${c.hatched_count} hatched`
                            : ''}
                          {c.offspring_count > 0
                            ? ` · ${c.offspring_count} offspring on file`
                            : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View
              style={[
                styles.comingSoon,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceRaised,
                  borderRadius: layout.radius.sm,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="hammer-wrench"
                size={14}
                color={colors.textTertiary}
              />
              <Text
                style={[styles.comingSoonText, { color: colors.textTertiary }]}
              >
                Editing outcomes, adding clutches, and recording
                offspring move to mobile in the next sprint.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.kvCell}>
      <Text style={[styles.kvLabel, { color: colors.textTertiary }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[styles.kvValue, { color: colors.textPrimary }]}>
        {value}
      </Text>
    </View>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  loading: { paddingVertical: 40, alignItems: 'center' },
  errorBlock: {
    borderWidth: 1,
    padding: 12,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
    lineHeight: 17,
  },

  heroCard: {
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  heroTitle: { fontSize: 16, fontWeight: '700' },
  heroMeta: { fontSize: 12 },
  male: { color: '#38bdf8' },
  female: { color: '#f472b6' },
  dim: { color: '#525252' },
  notes: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },

  kvGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  kvCell: { minWidth: '40%' },
  kvLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  kvValue: { fontSize: 13, fontWeight: '600' },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },

  emptyCard: {
    borderWidth: 1,
    padding: 14,
  },
  emptyText: { fontSize: 13, lineHeight: 18 },

  clutchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    padding: 12,
  },
  clutchTitle: { fontSize: 14, fontWeight: '600' },
  clutchMeta: { fontSize: 11, marginTop: 2 },

  comingSoon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  comingSoonText: {
    fontSize: 11,
    fontStyle: 'italic',
    flex: 1,
  },
});

export default withErrorBoundary(PairingDetailScreen, 'pairing-detail');
