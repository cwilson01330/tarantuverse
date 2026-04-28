/**
 * QR upload session — Sprint 8 Bundle 6.
 *
 * Owner generates a 20-min upload token and gets back a URL + QR code.
 * Hand off to another device (friend's phone, partner's iPad, the
 * laptop browser at home) to upload photos without anyone needing the
 * keeper's auth.
 *
 * UX:
 *   - On mount: POST to /<taxon>/<id>/upload-session
 *   - Render QR (using react-native-qrcode-svg) + URL
 *   - Copy-to-clipboard, system Share, "Generate new" actions
 *   - Live countdown to expiry — when it hits 0 the QR is greyed out
 *     and a "Generate new" CTA appears
 *
 * Web upload page caveat: the URL the API returns currently points to
 * `tarantuverse.com/upload/<token>`, where the existing upload page
 * only renders tarantula sessions. Microcopy notes this and offers a
 * direct copy of the URL anyway (so a beta tester can verify the
 * session shape via browser network tools while we ship the cross-
 * taxon upload page in Sprint 9).
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import {
  FormErrorBanner,
  extractErrorMessage,
} from '../components/forms/FormPrimitives';
import {
  type QRTaxon,
  type UploadSessionResponse,
  createUploadSession,
} from '../lib/qr';

export function QRUploadSessionScreen({ taxon }: { taxon: QRTaxon }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();

  const [session, setSession] = useState<UploadSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(true);
  const [copied, setCopied] = useState(false);

  // Live countdown — re-evaluated every second so the keeper sees the
  // token tick down. When expired we show a "Generate new" CTA rather
  // than a working QR (a stale QR would just 404 the upload page).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, []);

  const expiresInMs = useMemo(() => {
    if (!session) return null;
    return new Date(session.expires_at).getTime() - now;
  }, [session, now]);
  const expired = expiresInMs != null && expiresInMs <= 0;

  const generate = useCallback(async () => {
    if (!id) return;
    setGenerating(true);
    setError(null);
    setCopied(false);
    try {
      const data = await createUploadSession(taxon, id);
      setSession(data);
    } catch (err) {
      setError(extractErrorMessage(err, "Couldn't create an upload session."));
    } finally {
      setGenerating(false);
    }
  }, [id, taxon]);

  useEffect(() => {
    generate();
  }, [generate]);

  async function handleCopy() {
    if (!session) return;
    await Clipboard.setStringAsync(session.upload_url);
    setCopied(true);
    // Auto-clear the "Copied" indicator so a keeper can copy again.
    setTimeout(() => setCopied(false), 1800);
  }

  async function handleShare() {
    if (!session) return;
    try {
      await Share.share({
        message: `Upload photos here (expires in 20 min): ${session.upload_url}`,
        url: session.upload_url,
      });
    } catch {
      // User cancelled or share unavailable — silent.
    }
  }

  const animalName =
    session?.snake_name ?? session?.lizard_name ?? null;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen
        options={{ title: 'QR upload', headerBackTitle: 'Back' }}
      />
      <View style={styles.scroll}>
        {/* Intro */}
        <View
          style={[
            styles.intro,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: layout.radius.lg,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="qrcode-scan"
            size={28}
            color={colors.primary}
            style={{ marginBottom: 8 }}
          />
          <Text style={[styles.introTitle, { color: colors.textPrimary }]}>
            Hand off photo upload
          </Text>
          <Text style={[styles.introBody, { color: colors.textSecondary }]}>
            {animalName
              ? `Anyone with this QR can add photos to ${animalName} for the next 20 minutes — no login needed.`
              : 'Anyone with this QR can add photos for the next 20 minutes — no login needed.'}
          </Text>
        </View>

        {/* Body — error / loading / QR */}
        {error && <FormErrorBanner message={error} />}

        {generating && !session && (
          <View
            style={[
              styles.qrCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: layout.radius.lg,
              },
            ]}
          >
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.qrLoading, { color: colors.textTertiary }]}>
              Creating session…
            </Text>
          </View>
        )}

        {session && (
          <View
            style={[
              styles.qrCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: layout.radius.lg,
                opacity: expired ? 0.45 : 1,
              },
            ]}
          >
            {/* QR code — white background so dark-mode contrast still
                scans cleanly under store lighting. */}
            <View style={styles.qrWrap}>
              <QRCode
                value={session.upload_url}
                size={200}
                backgroundColor="#ffffff"
                color="#000000"
              />
            </View>

            <Text
              style={[styles.urlText, { color: colors.textSecondary }]}
              numberOfLines={2}
              selectable
            >
              {session.upload_url}
            </Text>

            <View style={styles.countdownRow}>
              <MaterialCommunityIcons
                name="timer-sand"
                size={14}
                color={expired ? colors.danger : colors.textTertiary}
              />
              <Text
                style={[
                  styles.countdown,
                  { color: expired ? colors.danger : colors.textTertiary },
                ]}
              >
                {expired
                  ? 'Expired — generate a new one below.'
                  : `Expires in ${formatCountdown(expiresInMs ?? 0)}`}
              </Text>
            </View>
          </View>
        )}

        {/* Actions */}
        {session && (
          <View style={styles.actionRow}>
            <ActionButton
              icon={copied ? 'check' : 'content-copy'}
              label={copied ? 'Copied' : 'Copy URL'}
              onPress={handleCopy}
              disabled={expired}
            />
            <ActionButton
              icon="share-variant-outline"
              label="Share"
              onPress={handleShare}
              disabled={expired}
            />
            <ActionButton
              icon="refresh"
              label={generating ? 'Generating…' : 'Generate new'}
              onPress={generate}
              disabled={generating}
              tone={expired ? 'primary' : 'default'}
            />
          </View>
        )}

        <Text style={[styles.footnote, { color: colors.textTertiary }]}>
          Web upload page support for snakes and lizards rolls out
          alongside this build. If the link doesn't render the upload
          form yet, that's the gap we're closing.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
  tone = 'default',
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'primary';
}) {
  const { colors, layout } = useTheme();
  const isPrimary = tone === 'primary';
  const bg = isPrimary ? colors.primary : colors.surface;
  const fg = isPrimary ? '#0B0B0B' : colors.textPrimary;
  const iconColor = isPrimary ? '#0B0B0B' : colors.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionButton,
        {
          backgroundColor: bg,
          borderColor: colors.border,
          borderRadius: layout.radius.md,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <MaterialCommunityIcons name={icon} size={18} color={iconColor} />
      <Text style={[styles.actionLabel, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function formatCountdown(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: {
    padding: 16,
    gap: 16,
    flex: 1,
  },

  // Intro
  intro: {
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  introTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  introBody: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },

  // QR card
  qrCard: {
    padding: 24,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
  },
  qrWrap: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
  },
  qrLoading: {
    fontSize: 12,
    marginTop: 12,
  },
  urlText: {
    fontSize: 11,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countdown: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
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
    fontSize: 12,
    fontWeight: '700',
  },

  footnote: {
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});

