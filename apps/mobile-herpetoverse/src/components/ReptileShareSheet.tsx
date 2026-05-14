/**
 * ReptileShareSheet — bottom sheet with the animal's permanent public
 * profile QR + URL.
 *
 * ADR-003: the QR encodes `https://herpetoverse.com/a/{id}` — the
 * taxon-agnostic public profile (collapsed from the old `/s/` + `/l/`
 * routes). It 403s for non-owners if the keeper's collection is set
 * private (controlled by `users.collection_visibility` on the API).
 * The QR works for enclosure labels, business cards, and "scan to see
 * the animal" scenarios.
 *
 * Mobile printing isn't supported in v1 — keepers who want printed
 * enclosure labels open the snake on web (where ReptileQRModal has the
 * print-with-themes flow shipped in Sprint 8). Footer link makes that
 * obvious. Once we do a fresh native build with expo-print linked we
 * can render labels here too.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

const WEB_BASE =
  process.env.EXPO_PUBLIC_WEB_URL || 'https://herpetoverse.com';

interface Props {
  visible: boolean;
  onClose: () => void;
  animalId: string;
  animalName?: string | null;
  /**
   * The keeper's collection_visibility. When 'private', non-owner
   * scanners hit a 403; we surface that warning so the keeper can
   * decide whether to flip visibility before sharing.
   */
  collectionVisibility?: 'public' | 'private' | null;
}

export function ReptileShareSheet({
  visible,
  onClose,
  animalId,
  animalName,
  collectionVisibility,
}: Props) {
  const { colors, layout } = useTheme();
  const [copied, setCopied] = useState(false);

  // ADR-003: one taxon-agnostic public-profile route.
  const profileUrl = `${WEB_BASE}/a/${animalId}`;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: animalName
          ? `${animalName} — ${profileUrl}`
          : profileUrl,
        url: profileUrl,
      });
    } catch {
      // User dismissed share sheet — no-op.
    }
  };

  const handleOpenWebLabels = () => {
    // Open the OWNER detail page on web, where the label-printing UI
    // lives (ReptileQRModal). Requires login on web. ADR-003 collapsed
    // the per-taxon route trees — one /app/reptiles/{id} path for all.
    Linking.openURL(`${WEB_BASE}/app/reptiles/${animalId}`);
  };

  const isPrivate = collectionVisibility === 'private';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: layout.radius.lg,
              borderTopRightRadius: layout.radius.lg,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <SafeAreaView edges={['bottom']}>
            {/* Header */}
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  Share {animalName ?? 'this animal'}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Permanent public profile link.
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <MaterialCommunityIcons
                  name="close"
                  size={22}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* Privacy banner (only when collection is private) */}
            {isPrivate ? (
              <View
                style={[
                  styles.privacyBanner,
                  {
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.warning,
                    borderRadius: layout.radius.md,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="lock-outline"
                  size={16}
                  color={colors.warning}
                />
                <Text
                  style={[styles.privacyText, { color: colors.textSecondary }]}
                >
                  Your collection is private. Anyone scanning this QR will
                  see "This collection is private." To share publicly,
                  switch your collection to public on web.
                </Text>
              </View>
            ) : null}

            {/* QR card */}
            <View
              style={[
                styles.qrCard,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  borderRadius: layout.radius.md,
                },
              ]}
            >
              <View style={styles.qrWrap}>
                <QRCode
                  value={profileUrl}
                  size={196}
                  backgroundColor="#ffffff"
                  color="#000000"
                />
              </View>
              <Text
                style={[styles.urlText, { color: colors.textSecondary }]}
                numberOfLines={2}
                selectable
              >
                {profileUrl}
              </Text>
            </View>

            {/* Action row — Copy + Share */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={handleCopy}
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.border,
                    borderRadius: layout.radius.md,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Copy URL"
              >
                <MaterialCommunityIcons
                  name={copied ? 'check' : 'content-copy'}
                  size={18}
                  color={copied ? colors.success : colors.textPrimary}
                />
                <Text
                  style={[
                    styles.actionText,
                    {
                      color: copied ? colors.success : colors.textPrimary,
                    },
                  ]}
                >
                  {copied ? 'Copied' : 'Copy URL'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleShare}
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                    borderRadius: layout.radius.md,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Share via system share sheet"
              >
                <MaterialCommunityIcons
                  name="share-variant"
                  size={18}
                  color="#0B0B0B"
                />
                <Text style={[styles.actionText, { color: '#0B0B0B' }]}>
                  Share
                </Text>
              </TouchableOpacity>
            </View>

            {/* Footer — labels on web */}
            <TouchableOpacity
              onPress={handleOpenWebLabels}
              style={styles.labelsLink}
              accessibilityRole="button"
              accessibilityLabel="Open this animal on web to print enclosure labels"
            >
              <MaterialCommunityIcons
                name="printer-outline"
                size={16}
                color={colors.textSecondary}
              />
              <Text
                style={[styles.labelsLinkText, { color: colors.textSecondary }]}
              >
                Print enclosure labels on web
              </Text>
              <MaterialCommunityIcons
                name="open-in-new"
                size={14}
                color={colors.textTertiary}
              />
            </TouchableOpacity>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },

  privacyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  privacyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },

  qrCard: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    gap: 12,
  },
  qrWrap: {
    padding: 14,
    backgroundColor: '#ffffff',
    borderRadius: 8,
  },
  urlText: { fontSize: 12, textAlign: 'center' },

  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
  },
  actionText: { fontSize: 14, fontWeight: '600' },

  labelsLink: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  labelsLinkText: { fontSize: 12, fontWeight: '500' },
});

export default ReptileShareSheet;
