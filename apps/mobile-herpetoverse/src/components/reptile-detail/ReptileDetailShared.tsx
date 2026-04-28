/**
 * Shared building blocks for snake + lizard detail screens.
 *
 * Snakes and lizards have effectively the same detail surface — same
 * weigh-in / feeding / shed log shapes, same hero stats, same look.
 * Keeping the layout primitives in one place means a UX tweak for one
 * taxon lands on the other automatically, and the per-taxon screen can
 * stay thin (just orchestration: fetch the data, render these blocks).
 *
 * Anything taxon-specific (e.g. brumation labels, taxon glyph, copy)
 * is exposed through props rather than branching inside the component.
 *
 * Bundle 4 will add navigation handlers for "Log feeding", "Log weight",
 * "Log shed", and "Edit" — the buttons exist now and route to the same
 * placeholder paths the add-reptile stub uses, so the detail screen UX
 * is testable end-to-end before the form screens land.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ReactNode, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { relativeDays } from '../../utils/relative-days';
import type { Sex, WeightContext } from '../../lib/snakes';
import type { Photo } from '../../lib/photos';

// Minimal structural types — shared between snake (snakes.ts has
// `snake_id: string`) and lizard (lizards.ts has both snake_id and
// lizard_id as `string | null` since the row table is polymorphic).
// Importing either taxon's full schema here would fail to typecheck
// for the other; defining the slim view used by these components keeps
// both screens happy.
export interface WeightLogView {
  id: string;
  weighed_at: string;
  weight_g: string;
  context: WeightContext;
  notes: string | null;
}

export interface FeedingLogView {
  id: string;
  fed_at: string;
  food_type: string | null;
  prey_weight_g: string | null;
  accepted: boolean;
  notes: string | null;
}

export interface ShedLogView {
  id: string;
  shed_at: string;
  is_complete_shed: boolean;
  has_retained_shed: boolean;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Hero card — photo + title + key stats
// ---------------------------------------------------------------------------

export interface HeroProps {
  title: string;
  scientificName: string | null;
  sex: Sex | null;
  photoUrl: string | null;
  currentWeightG: string | null;
  lastFedAt: string | null;
  lastShedAt: string | null;
  brumationActive?: boolean;
  /** Emoji to show when there's no photo. */
  fallbackGlyph: string;
}

export function ReptileHero({
  title,
  scientificName,
  sex,
  photoUrl,
  currentWeightG,
  lastFedAt,
  lastShedAt,
  brumationActive,
  fallbackGlyph,
}: HeroProps) {
  const { colors, layout } = useTheme();
  const weight = formatGrams(currentWeightG);
  const lastFed = relativeDays(lastFedAt);
  const lastShed = relativeDays(lastShedAt);

  return (
    <View
      style={[
        sharedStyles.heroCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: layout.radius.lg,
        },
      ]}
    >
      <View style={sharedStyles.heroHeader}>
        <View style={sharedStyles.heroPhotoWrap}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={sharedStyles.heroPhoto} />
          ) : (
            <View
              style={[
                sharedStyles.heroPhoto,
                { backgroundColor: colors.surfaceRaised },
              ]}
            >
              <Text style={{ fontSize: 36 }}>{fallbackGlyph}</Text>
            </View>
          )}
        </View>
        <View style={sharedStyles.heroTitleBlock}>
          <Text
            style={[sharedStyles.heroTitle, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            {title}
          </Text>
          {scientificName && (
            <Text
              style={[
                sharedStyles.heroSubtitle,
                { color: colors.textTertiary },
              ]}
              numberOfLines={1}
            >
              {scientificName}
            </Text>
          )}
          <View style={sharedStyles.heroChipRow}>
            <SexChip sex={sex} />
            {brumationActive && (
              <View
                style={[
                  sharedStyles.chip,
                  { backgroundColor: '#0ea5e920', borderColor: '#0ea5e940' },
                ]}
              >
                <MaterialCommunityIcons
                  name="snowflake"
                  size={12}
                  color="#0ea5e9"
                />
                <Text style={[sharedStyles.chipText, { color: '#0ea5e9' }]}>
                  Brumating
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <View
        style={[sharedStyles.heroStatsRow, { borderTopColor: colors.border }]}
      >
        <HeroStat label="Weight" value={weight ?? '—'} />
        <HeroStat label="Last fed" value={lastFed ?? '—'} />
        <HeroStat label="Last shed" value={lastShed ?? '—'} />
      </View>
    </View>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={sharedStyles.heroStat}>
      <Text style={[sharedStyles.heroStatLabel, { color: colors.textTertiary }]}>
        {label.toUpperCase()}
      </Text>
      <Text
        style={[sharedStyles.heroStatValue, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function SexChip({ sex }: { sex: Sex | null }) {
  const { colors } = useTheme();
  const isFemale = sex === 'female';
  const isMale = sex === 'male';
  const bg = isFemale ? '#ec489920' : isMale ? '#3b82f620' : colors.border;
  const fg = isFemale ? '#ec4899' : isMale ? '#3b82f6' : colors.textTertiary;
  const icon = isFemale
    ? 'gender-female'
    : isMale
      ? 'gender-male'
      : 'help-circle-outline';
  const label = isFemale ? 'Female' : isMale ? 'Male' : 'Unknown sex';
  return (
    <View
      style={[
        sharedStyles.chip,
        { backgroundColor: bg, borderColor: 'transparent' },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={12} color={fg} />
      <Text style={[sharedStyles.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Photos strip — horizontal scroll preview with tap-to-gallery + add CTA.
// ---------------------------------------------------------------------------

export function PhotosStrip({
  photos,
  onOpenGallery,
}: {
  photos: Photo[] | null;
  /** Tapping any thumb or the add tile opens the gallery screen. */
  onOpenGallery: () => void;
}) {
  const { colors, layout } = useTheme();

  // Limit to a recent slice — the gallery has the full set. Mirrors web,
  // where the detail page surfaces ~6 photos and a "View all" link.
  const PREVIEW = 6;
  const visible = photos ? photos.slice(0, PREVIEW) : [];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={photoStripStyles.row}
    >
      {/* Add tile — always first so it's reachable when there are
          already 6+ photos and the rest scroll off-screen. */}
      <TouchableOpacity
        onPress={onOpenGallery}
        style={[
          photoStripStyles.addTile,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: layout.radius.md,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add photo"
      >
        <MaterialCommunityIcons
          name="camera-plus-outline"
          size={26}
          color={colors.primary}
        />
        <Text
          style={[photoStripStyles.addTileLabel, { color: colors.textSecondary }]}
        >
          Add
        </Text>
      </TouchableOpacity>

      {visible.map((p) => (
        <TouchableOpacity
          key={p.id}
          onPress={onOpenGallery}
          style={[
            photoStripStyles.thumb,
            { borderColor: colors.border, borderRadius: layout.radius.md },
          ]}
          accessibilityRole="imagebutton"
          accessibilityLabel={p.caption ?? 'Reptile photo'}
        >
          <Image
            source={{ uri: p.thumbnail_url ?? p.url }}
            style={photoStripStyles.thumbImage}
          />
        </TouchableOpacity>
      ))}

      {photos && photos.length > PREVIEW && (
        <TouchableOpacity
          onPress={onOpenGallery}
          style={[
            photoStripStyles.viewAllTile,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: layout.radius.md,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`View all ${photos.length} photos`}
        >
          <Text
            style={[photoStripStyles.viewAllText, { color: colors.textPrimary }]}
          >
            View all
          </Text>
          <Text
            style={[photoStripStyles.viewAllCount, { color: colors.textTertiary }]}
          >
            {photos.length}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const photoStripStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  addTile: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 4,
  },
  addTileLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  thumb: {
    width: 84,
    height: 84,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  viewAllTile: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    gap: 2,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '700',
  },
  viewAllCount: {
    fontSize: 11,
  },
});

// ---------------------------------------------------------------------------
// Action row — Log feeding / Log weight / Log shed
// ---------------------------------------------------------------------------

export interface LogActionsProps {
  onLogFeeding: () => void;
  onLogWeight: () => void;
  onLogShed: () => void;
}

export function LogActions({
  onLogFeeding,
  onLogWeight,
  onLogShed,
}: LogActionsProps) {
  return (
    <View style={sharedStyles.actionRow}>
      <ActionButton
        icon="food-drumstick"
        label="Feeding"
        onPress={onLogFeeding}
      />
      <ActionButton icon="scale-bathroom" label="Weight" onPress={onLogWeight} />
      <ActionButton icon="snake" label="Shed" onPress={onLogShed} />
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors, layout } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        sharedStyles.actionButton,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: layout.radius.md,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Log ${label.toLowerCase()}`}
    >
      <MaterialCommunityIcons name={icon} size={18} color={colors.primary} />
      <Text style={[sharedStyles.actionLabel, { color: colors.textPrimary }]}>
        Log {label}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={sharedStyles.section}>
      <Text style={[sharedStyles.sectionTitle, { color: colors.primary }]}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// View All toggle — same pattern as web detail clients (PREVIEW_COUNT slice
// with a button below the list to expand/collapse the rest).
// ---------------------------------------------------------------------------

function ViewAllToggle({
  total,
  preview,
  showAll,
  onToggle,
}: {
  total: number;
  preview: number;
  showAll: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  if (total <= preview) return null;
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={sharedStyles.viewAllButton}
      accessibilityRole="button"
    >
      <Text style={[sharedStyles.viewAllText, { color: colors.textSecondary }]}>
        {showAll
          ? `Show only the most recent ${preview}`
          : `Show all ${total}`}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Weigh-ins list
// ---------------------------------------------------------------------------

const WEIGHT_CONTEXT_LABELS: Record<WeightContext, string> = {
  routine: 'Routine',
  pre_feed: 'Pre-feed',
  post_shed: 'Post-shed',
  pre_breeding: 'Pre-breeding',
  post_lay: 'Post-lay',
  other: 'Other',
};

export function WeighInsList({ logs }: { logs: WeightLogView[] }) {
  const { colors, layout } = useTheme();
  const sorted = useMemo(
    () =>
      [...logs].sort(
        (a, b) =>
          new Date(b.weighed_at).getTime() - new Date(a.weighed_at).getTime(),
      ),
    [logs],
  );
  const PREVIEW = 10;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sorted : sorted.slice(0, PREVIEW);

  if (sorted.length === 0) {
    return (
      <EmptyHint message="No weights yet. Log one to start the trend." />
    );
  }

  return (
    <View>
      <View
        style={[
          sharedStyles.list,
          { borderColor: colors.border, borderRadius: layout.radius.md },
        ]}
      >
        {visible.map((l, idx) => (
          <View
            key={l.id}
            style={[
              sharedStyles.listRow,
              {
                borderBottomColor: colors.border,
                borderBottomWidth: idx < visible.length - 1 ? 1 : 0,
              },
            ]}
          >
            <Text style={[sharedStyles.rowDate, { color: colors.textTertiary }]}>
              {fmtShortDate(l.weighed_at)}
            </Text>
            <Text style={[sharedStyles.rowPrimary, { color: colors.textPrimary }]}>
              {fmtDecimal(l.weight_g, 1)} g
            </Text>
            <View
              style={[
                sharedStyles.rowChip,
                { backgroundColor: colors.surfaceRaised },
              ]}
            >
              <Text
                style={[sharedStyles.rowChipText, { color: colors.textSecondary }]}
              >
                {WEIGHT_CONTEXT_LABELS[l.context] ?? l.context}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <ViewAllToggle
        total={sorted.length}
        preview={PREVIEW}
        showAll={showAll}
        onToggle={() => setShowAll((v) => !v)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Feedings list
// ---------------------------------------------------------------------------

export function FeedingsList({ feedings }: { feedings: FeedingLogView[] }) {
  const { colors, layout } = useTheme();
  const sorted = useMemo(
    () =>
      [...feedings].sort(
        (a, b) =>
          new Date(b.fed_at).getTime() - new Date(a.fed_at).getTime(),
      ),
    [feedings],
  );
  const PREVIEW = 10;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sorted : sorted.slice(0, PREVIEW);

  if (sorted.length === 0) {
    return <EmptyHint message="No feedings logged yet." />;
  }

  return (
    <View>
      <View
        style={[
          sharedStyles.list,
          { borderColor: colors.border, borderRadius: layout.radius.md },
        ]}
      >
        {visible.map((f, idx) => (
          <View
            key={f.id}
            style={[
              sharedStyles.listRow,
              {
                borderBottomColor: colors.border,
                borderBottomWidth: idx < visible.length - 1 ? 1 : 0,
              },
            ]}
          >
            <Text style={[sharedStyles.rowDate, { color: colors.textTertiary }]}>
              {fmtShortDate(f.fed_at)}
            </Text>
            <View
              style={[
                sharedStyles.rowChip,
                {
                  backgroundColor: f.accepted ? '#10b98120' : colors.surfaceRaised,
                },
              ]}
            >
              <Text
                style={[
                  sharedStyles.rowChipText,
                  { color: f.accepted ? '#34d399' : colors.textSecondary },
                ]}
              >
                {f.accepted ? 'Accepted' : 'Refused'}
              </Text>
            </View>
            <Text
              style={[sharedStyles.rowSecondary, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {[
                f.food_type,
                f.prey_weight_g ? `${fmtDecimal(f.prey_weight_g, 1)} g` : null,
              ]
                .filter(Boolean)
                .join(' · ') || '—'}
            </Text>
          </View>
        ))}
      </View>
      <ViewAllToggle
        total={sorted.length}
        preview={PREVIEW}
        showAll={showAll}
        onToggle={() => setShowAll((v) => !v)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sheds list
// ---------------------------------------------------------------------------

export function ShedsList({ sheds }: { sheds: ShedLogView[] }) {
  const { colors, layout } = useTheme();
  const sorted = useMemo(
    () =>
      [...sheds].sort(
        (a, b) =>
          new Date(b.shed_at).getTime() - new Date(a.shed_at).getTime(),
      ),
    [sheds],
  );
  // Sheds preview at 5 — rarer events; matches web pattern.
  const PREVIEW = 5;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sorted : sorted.slice(0, PREVIEW);

  if (sorted.length === 0) {
    return <EmptyHint message="No sheds logged yet." />;
  }

  return (
    <View>
      <View
        style={[
          sharedStyles.list,
          { borderColor: colors.border, borderRadius: layout.radius.md },
        ]}
      >
        {visible.map((s, idx) => (
          <View
            key={s.id}
            style={[
              sharedStyles.listRow,
              {
                borderBottomColor: colors.border,
                borderBottomWidth: idx < visible.length - 1 ? 1 : 0,
              },
            ]}
          >
            <Text style={[sharedStyles.rowDate, { color: colors.textTertiary }]}>
              {fmtShortDate(s.shed_at)}
            </Text>
            <View
              style={[
                sharedStyles.rowChip,
                {
                  backgroundColor: s.is_complete_shed
                    ? '#10b98120'
                    : '#f59e0b20',
                },
              ]}
            >
              <Text
                style={[
                  sharedStyles.rowChipText,
                  {
                    color: s.is_complete_shed ? '#34d399' : '#fbbf24',
                  },
                ]}
              >
                {s.is_complete_shed ? 'One piece' : 'Broken up'}
              </Text>
            </View>
            {s.has_retained_shed && (
              <View
                style={[
                  sharedStyles.rowChip,
                  { backgroundColor: '#f43f5e20' },
                ]}
              >
                <Text style={[sharedStyles.rowChipText, { color: '#fb7185' }]}>
                  Retained
                </Text>
              </View>
            )}
            <Text
              style={[sharedStyles.rowSecondary, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {s.notes ?? ''}
            </Text>
          </View>
        ))}
      </View>
      <ViewAllToggle
        total={sorted.length}
        preview={PREVIEW}
        showAll={showAll}
        onToggle={() => setShowAll((v) => !v)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Loading + error states
// ---------------------------------------------------------------------------

export function LoadingShell() {
  const { colors } = useTheme();
  return (
    <View style={sharedStyles.center}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export function RetryError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { colors, layout } = useTheme();
  return (
    <View style={sharedStyles.center}>
      <MaterialCommunityIcons
        name="alert-circle-outline"
        size={36}
        color={colors.danger}
        style={{ marginBottom: 12 }}
      />
      <Text
        style={[
          sharedStyles.errorMessage,
          { color: colors.textPrimary, marginBottom: 12 },
        ]}
      >
        {message}
      </Text>
      <TouchableOpacity
        onPress={onRetry}
        style={[
          sharedStyles.retryButton,
          {
            backgroundColor: colors.primary,
            borderRadius: layout.radius.md,
          },
        ]}
        accessibilityRole="button"
      >
        <Text style={sharedStyles.retryButtonText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyHint({ message }: { message: string }) {
  const { colors, layout } = useTheme();
  return (
    <View
      style={[
        sharedStyles.emptyHint,
        {
          borderColor: colors.border,
          borderRadius: layout.radius.md,
        },
      ]}
    >
      <Text style={[sharedStyles.emptyHintText, { color: colors.textTertiary }]}>
        {message}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatGrams(g: string | null): string | null {
  if (!g) return null;
  const n = Number(g);
  if (!Number.isFinite(n)) return null;
  // Drop trailing .0 — "650 g" reads cleaner than "650.0 g"; but keep
  // sub-gram precision when it exists.
  return `${fmtDecimal(g, 1)} g`;
}

function fmtDecimal(g: string | number | null, places: number): string {
  if (g == null) return '—';
  const n = typeof g === 'number' ? g : Number(g);
  if (!Number.isFinite(n)) return '—';
  return n
    .toFixed(places)
    .replace(/\.?0+$/, '');
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const sharedStyles = StyleSheet.create({
  // Hero
  heroCard: {
    padding: 16,
    borderWidth: 1,
  },
  heroHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  heroPhotoWrap: {
    width: 88,
    height: 88,
    borderRadius: 12,
    overflow: 'hidden',
  },
  heroPhoto: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 2,
  },
  heroSubtitle: {
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  heroChipRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  heroStatsRow: {
    flexDirection: 'row',
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  heroStat: { flex: 1, minWidth: 0 },
  heroStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 2,
  },
  heroStatValue: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Chips
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Sections
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 4,
  },

  // Lists
  list: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowDate: {
    fontSize: 12,
    width: 56,
    flexShrink: 0,
  },
  rowPrimary: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 64,
    flexShrink: 0,
  },
  rowChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    flexShrink: 0,
  },
  rowChipText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  rowSecondary: {
    fontSize: 12,
    flex: 1,
    minWidth: 0,
  },

  // View all toggle
  viewAllButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignSelf: 'flex-start',
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },

  // Empty hint inside a section
  emptyHint: {
    padding: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  emptyHintText: {
    fontSize: 12,
    fontStyle: 'italic',
  },

  // Loading + error
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 320,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#0B0B0B',
    fontSize: 14,
    fontWeight: '700',
  },
});
