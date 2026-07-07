/**
 * AnimalTransferSection — Provenance block + Transfer/Rehome action.
 *
 * Ports the Tarantuverse mobile transfer UX (apps/mobile/app/invert/[id].tsx)
 * onto the Herpetoverse unified `animals` surface. Two responsibilities,
 * rendered as two cards on the animal detail screen:
 *
 *  1. Provenance — read-only. Shown only when the animal carries a frozen
 *     `provenance` snapshot (i.e. it was claimed via a transfer link). Honest
 *     and plain: dam/sire are null for animals (no fabricated lineage), so
 *     the block shows origin keeper, breeder handle, date acquired, and the
 *     weight / length / last-shed captured at hand-off.
 *
 *  2. Transfer / rehome — the seller's action. If already transferred
 *     (`transferred_out_at` set) this collapses to a "Transferred" badge and
 *     the action is hidden. Otherwise a "Transfer / Rehome" button opens a
 *     form (note, private sale price, include-photos toggle, expiry) that
 *     POSTs the transfer and surfaces the returned claim link with Copy +
 *     Share. Claiming happens on the HV web claim page — there is no mobile
 *     claim screen by design.
 *
 * Conventions: apiClient (via lib/animals) baseURL already includes /api/v1;
 * ThemeContext colors only (colors.danger / colors.warning — never
 * colors.error); StyleSheet.create at module level; the form modal wraps its
 * inputs in KeyboardAvoidingView and its sheet uses insets.bottom.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { Section } from './reptile-detail/ReptileDetailShared';
import {
  type Animal,
  animalTitle,
  createAnimalTransfer,
} from '../lib/animals';

function extractError(e: any): string {
  return (
    e?.response?.data?.detail ||
    e?.message ||
    'Something went wrong. Please try again.'
  );
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

/** A single label / value row inside a provenance card. */
function ProvRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.provRow}>
      <Text style={[styles.provLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text
        style={[styles.provValue, { color: colors.textPrimary }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

export function AnimalTransferSection({
  animal,
  onTransferred,
}: {
  animal: Animal;
  /** Called after a claim link is generated so the parent can refetch. */
  onTransferred?: () => void | Promise<void>;
}) {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();

  const [formOpen, setFormOpen] = useState(false);
  const [note, setNote] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [includePhotos, setIncludePhotos] = useState(true);
  const [expiresIn, setExpiresIn] = useState('30');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // The generated claim link — surfaced with Copy + Share once created.
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const prov = animal.provenance ?? null;
  const isTransferred = !!animal.transferred_out_at;

  const resetForm = () => {
    setNote('');
    setSalePrice('');
    setIncludePhotos(true);
    setExpiresIn('30');
    setFormError('');
    setClaimUrl(null);
    setCopied(false);
  };

  const closeForm = () => {
    if (submitting) return;
    setFormOpen(false);
  };

  const submit = async () => {
    setSubmitting(true);
    setFormError('');
    try {
      const parsedPrice = salePrice.trim()
        ? Number(salePrice.replace(/[^0-9.]/g, ''))
        : null;
      const parsedExpiry = expiresIn.trim() ? Number(expiresIn) : 30;
      const res = await createAnimalTransfer(animal.id, {
        note: note.trim() || null,
        sale_price:
          parsedPrice != null && !Number.isNaN(parsedPrice)
            ? parsedPrice
            : null,
        include_photos: includePhotos,
        expires_in_days:
          !Number.isNaN(parsedExpiry) && parsedExpiry > 0 ? parsedExpiry : 30,
      });
      setClaimUrl(res.claim_url);
      if (onTransferred) await onTransferred();
    } catch (e: any) {
      setFormError(extractError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const shareMessage = claimUrl
    ? `I'm rehoming my ${animalTitle(animal)} on Herpetoverse — claim it here: ${claimUrl}`
    : '';

  const handleShare = async () => {
    if (!claimUrl) return;
    try {
      await Share.share({ message: shareMessage });
    } catch {
      // User dismissed the share sheet — no-op.
    }
  };

  const handleCopy = async () => {
    if (!claimUrl) return;
    try {
      await Clipboard.setStringAsync(claimUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — Share remains as the fallback path.
    }
  };

  return (
    <>
      {/* ── Provenance (only when the animal was claimed via transfer) ── */}
      {prov && (
        <Section title="Provenance">
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.border,
                borderRadius: layout.radius.md,
              },
            ]}
          >
            {prov.origin_keeper_name ? (
              <ProvRow label="Origin keeper" value={prov.origin_keeper_name} />
            ) : null}
            {prov.breeder_handle ? (
              <ProvRow label="Breeder" value={`@${prov.breeder_handle}`} />
            ) : null}
            {prov.dob_or_acquired ? (
              <ProvRow
                label="Date acquired"
                value={fmtDate(prov.dob_or_acquired)}
              />
            ) : null}
            {prov.weight_g != null ? (
              <ProvRow label="Weight at hand-off" value={`${prov.weight_g} g`} />
            ) : null}
            {prov.length_in != null ? (
              <ProvRow
                label="Length at hand-off"
                value={`${prov.length_in} in`}
              />
            ) : null}
            {prov.last_shed_at ? (
              <ProvRow label="Last shed" value={fmtDate(prov.last_shed_at)} />
            ) : null}
            {prov.transferred_at ? (
              <ProvRow
                label="Transferred"
                value={fmtDate(prov.transferred_at)}
              />
            ) : null}
            <Text style={[styles.provFootnote, { color: colors.textTertiary }]}>
              Snapshot recorded when this animal was handed off. Lineage is only
              shown when it was bred on-platform.
            </Text>
          </View>
        </Section>
      )}

      {/* ── Transfer / rehome ── */}
      <Section title="Transfer / Rehome">
        {isTransferred ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.border,
                borderRadius: layout.radius.md,
              },
            ]}
          >
            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: `${colors.warning}22` },
                ]}
              >
                <MaterialCommunityIcons
                  name="swap-horizontal"
                  size={14}
                  color={colors.warning}
                />
                <Text style={[styles.badgeText, { color: colors.warning }]}>
                  Transferred
                </Text>
              </View>
            </View>
            <Text style={[styles.transferredNote, { color: colors.textSecondary }]}>
              Handed off {fmtDate(animal.transferred_out_at)}. This is a
              historical record.
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.border,
                borderRadius: layout.radius.md,
              },
            ]}
          >
            <Text style={[styles.blurb, { color: colors.textSecondary }]}>
              Sold or rehoming this animal? Generate a one-time claim link the
              buyer can use to add it to their collection — pre-loaded with
              species, provenance, and photos. We never process the sale.
            </Text>
            <TouchableOpacity
              onPress={() => {
                resetForm();
                setFormOpen(true);
              }}
              style={[
                styles.primaryBtn,
                {
                  backgroundColor: colors.primary,
                  borderRadius: layout.radius.md,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Transfer or rehome this animal"
            >
              <MaterialCommunityIcons
                name="swap-horizontal"
                size={18}
                color="#0B0B0B"
              />
              <Text style={styles.primaryBtnText}>Transfer / Rehome</Text>
            </TouchableOpacity>
          </View>
        )}
      </Section>

      {/* ── Transfer form / claim-link sheet ── */}
      <Modal
        visible={formOpen}
        transparent
        animationType="slide"
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          style={styles.modalWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderTopLeftRadius: layout.radius.lg,
                borderTopRightRadius: layout.radius.lg,
                paddingBottom: insets.bottom + 20,
              },
            ]}
          >
            <View style={styles.sheetHandleWrap}>
              <View
                style={[styles.sheetHandle, { backgroundColor: colors.border }]}
              />
            </View>

            {claimUrl ? (
              // ── Success state — the claim link with Copy + Share ──
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                  Claim link ready
                </Text>
                <Text
                  style={[styles.blurb, { color: colors.textSecondary }]}
                >
                  Send this to the buyer. They open it, sign in, and the animal
                  drops into their collection. The link expires automatically.
                </Text>
                <View
                  style={[
                    styles.linkBox,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      borderRadius: layout.radius.sm,
                    },
                  ]}
                >
                  <Text
                    style={[styles.linkText, { color: colors.textPrimary }]}
                    numberOfLines={2}
                  >
                    {claimUrl}
                  </Text>
                </View>

                <View style={styles.linkActions}>
                  <TouchableOpacity
                    onPress={handleCopy}
                    style={[
                      styles.ghostBtn,
                      {
                        borderColor: colors.border,
                        borderRadius: layout.radius.md,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Copy claim link"
                  >
                    <MaterialCommunityIcons
                      name={copied ? 'check' : 'content-copy'}
                      size={18}
                      color={copied ? colors.primary : colors.textPrimary}
                    />
                    <Text
                      style={[
                        styles.ghostBtnText,
                        { color: copied ? colors.primary : colors.textPrimary },
                      ]}
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleShare}
                    style={[
                      styles.confirmBtn,
                      {
                        backgroundColor: colors.primary,
                        borderRadius: layout.radius.md,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Share claim link"
                  >
                    <MaterialCommunityIcons
                      name="share-variant"
                      size={18}
                      color="#0B0B0B"
                    />
                    <Text style={styles.primaryBtnText}>Share</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={() => setFormOpen(false)}
                  style={styles.doneRow}
                  accessibilityRole="button"
                >
                  <Text style={[styles.doneText, { color: colors.textSecondary }]}>
                    Done
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              // ── Form state ──
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                  Transfer {animalTitle(animal)}
                </Text>

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Note to buyer (optional)
                </Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Feeding notes, temperament, etc."
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  style={[
                    styles.input,
                    styles.textarea,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                      borderRadius: layout.radius.sm,
                    },
                  ]}
                />

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Sale price (optional)
                </Text>
                <TextInput
                  value={salePrice}
                  onChangeText={setSalePrice}
                  placeholder="0.00"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                      borderRadius: layout.radius.sm,
                    },
                  ]}
                />
                <Text style={[styles.hint, { color: colors.textTertiary }]}>
                  Private — never shown to the buyer. For your records only.
                </Text>

                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.switchLabel, { color: colors.textPrimary }]}
                    >
                      Include photos
                    </Text>
                    <Text style={[styles.hint, { color: colors.textTertiary }]}>
                      Copies this animal's photos onto the buyer's record.
                    </Text>
                  </View>
                  <Switch
                    value={includePhotos}
                    onValueChange={setIncludePhotos}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Link expires in (days)
                </Text>
                <TextInput
                  value={expiresIn}
                  onChangeText={setExpiresIn}
                  placeholder="30"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                      borderRadius: layout.radius.sm,
                    },
                  ]}
                />
                <Text style={[styles.hint, { color: colors.textTertiary }]}>
                  1–90 days. Unclaimed links expire automatically.
                </Text>

                {formError !== '' && (
                  <Text style={[styles.errorText, { color: colors.danger }]}>
                    {formError}
                  </Text>
                )}

                <View style={styles.sheetActions}>
                  <TouchableOpacity
                    onPress={closeForm}
                    disabled={submitting}
                    style={[
                      styles.ghostBtn,
                      {
                        borderColor: colors.border,
                        borderRadius: layout.radius.md,
                      },
                    ]}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[styles.ghostBtnText, { color: colors.textPrimary }]}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={submit}
                    disabled={submitting}
                    style={[
                      styles.confirmBtn,
                      {
                        backgroundColor: colors.primary,
                        borderRadius: layout.radius.md,
                        opacity: submitting ? 0.6 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Generate claim link"
                  >
                    {submitting ? (
                      <ActivityIndicator color="#0B0B0B" />
                    ) : (
                      <Text style={styles.primaryBtnText}>
                        Generate claim link
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

export default AnimalTransferSection;

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  // Provenance rows
  provRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  provLabel: { fontSize: 13, flexShrink: 0 },
  provValue: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  provFootnote: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  // Transferred badge
  badgeRow: { flexDirection: 'row' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  transferredNote: { fontSize: 13, lineHeight: 18 },
  // Transfer CTA card
  blurb: { fontSize: 13, lineHeight: 19 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  primaryBtnText: {
    color: '#0B0B0B',
    fontSize: 15,
    fontWeight: '700',
  },
  // Modal / sheet
  modalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: { borderWidth: 1, padding: 20, maxHeight: '90%' },
  sheetHandleWrap: { alignItems: 'center', marginBottom: 8 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2 },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  textarea: { minHeight: 64, textAlignVertical: 'top', paddingTop: 10 },
  hint: { fontSize: 11, lineHeight: 15, marginTop: 6 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  switchLabel: { fontSize: 15, fontWeight: '600' },
  errorText: { fontSize: 13, marginTop: 14 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  ghostBtnText: { fontSize: 15, fontWeight: '600' },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  // Claim-link success state
  linkBox: {
    borderWidth: 1,
    padding: 12,
    marginTop: 14,
  },
  linkText: { fontSize: 13, fontWeight: '600' },
  linkActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  doneRow: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  doneText: { fontSize: 15, fontWeight: '600' },
});
