/**
 * Share-card composer (spec §4.3). Live preview, shape chips, field toggles,
 * "Make a link to this card", Save and Share. Sharing changes nothing in the
 * app (spec §6) — this screen only ever writes a card link if asked.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { TYPE } from '../../src/theme/type';
import { AppHeader } from '../../src/components/AppHeader';
import { CardShape, FIELDS, FIELD_LABELS, createShareCard, getShareDefaults } from '../../src/lib/share-cards';

const ASPECT: Record<CardShape, number> = { story: 1080 / 1920, post: 1080 / 1350, square: 1 };

/** A card link made in this screen session, reusable while fields+shape are unchanged. */
interface MadeLink { key: string; cardLink: string }

export default function ShareCardScreen() {
  const router = useRouter();
  const { animalId } = useLocalSearchParams<{ animalId: string }>();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [shape, setShape] = useState<CardShape>('story');
  const [fields, setFields] = useState<string[] | null>(null);
  const [link, setLink] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);
  const madeLink = useRef<MadeLink | null>(null);
  const [shownLink, setShownLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const noFields = fields !== null && fields.length === 0;

  useEffect(() => { getShareDefaults().then(setFields).catch(() => setFields(FIELDS)); }, []);

  useEffect(() => {
    if (!fields || !animalId) return;
    if (timer.current) clearTimeout(timer.current);
    // Any change invalidates responses still in flight.
    const mine = ++reqId.current;
    // Drop the old image so a new shape never shows a stretched stale preview.
    setPreview(null);
    if (fields.length === 0) {
      setPreview(null);
      setError(null);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        setError(null);
        const r = await createShareCard({ animal_id: animalId, fields, shape, link: false, preview: true });
        if (mine === reqId.current) setPreview(r.image_url);
      } catch {
        if (mine === reqId.current) { setPreview(null); setError("Couldn't make the card. Try again."); }
      }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [fields, shape, animalId]);

  useEffect(() => () => {
    reqId.current += 1;
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const copyLink = async () => {
    if (!shownLink) return;
    await Clipboard.setStringAsync(shownLink);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const linkKey = (f: string[], s: CardShape) => `${[...f].sort().join(',')}|${s}`;

  const toggle = (f: string) => {
    madeLink.current = null;
    setShownLink(null);
    setFields((cur) => ((cur ?? []).includes(f) ? (cur ?? []).filter((x) => x !== f) : [...(cur ?? []), f]));
  };
  const pickShape = (s: CardShape) => { madeLink.current = null; setShownLink(null); setShape(s); };
  const onLinkChange = (v: boolean) => { if (!v) { madeLink.current = null; setShownLink(null); } setLink(v); };

  const produce = async (): Promise<{ file: string; cardLink: string | null }> => {
    const key = linkKey(fields!, shape);
    const reuse = link && madeLink.current?.key === key ? madeLink.current : null;
    const r = await createShareCard({ animal_id: animalId!, fields: fields!, shape, link: link && !reuse });
    if (link && r.card_link) madeLink.current = { key, cardLink: r.card_link };
    const file = `${FileSystem.cacheDirectory}share-card-${Date.now()}.png`;
    const dl = await FileSystem.downloadAsync(r.image_url, file);
    const ctype = Object.entries(dl.headers ?? {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1];
    // Reject a non-image body (an error page); a missing header is allowed.
    if (dl.status !== 200 || (ctype != null && !String(ctype).toLowerCase().startsWith('image/'))) throw new Error('download');
    const cardLink = reuse ? reuse.cardLink : r.card_link;
    if (cardLink) setShownLink(cardLink);
    return { file, cardLink };
  };

  const onShare = async () => {
    setBusy('share');
    try {
      const { file } = await produce();
      await Sharing.shareAsync(file, { mimeType: 'image/png', dialogTitle: 'Share card', UTI: 'public.png' });
    } catch {
      setError("Couldn't make the card. Try again.");
    } finally { setBusy(null); }
  };

  const onSave = async () => {
    setBusy('save');
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) { setError('Allow photo access to save cards.'); return; }
      const { file } = await produce();
      await MediaLibrary.saveToLibraryAsync(file);
      Alert.alert('Saved to Photos');
    } catch {
      setError("Couldn't save the card. Try again.");
    } finally { setBusy(null); }
  };

  const disabled = !!busy || !fields || noFields;
  const styles = makeStyles(colors);
  return (
    <View style={styles.flex}>
      <AppHeader title="Share card"
        leftAction={<TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close"><MaterialCommunityIcons name="close" size={26} color={iconColor} /></TouchableOpacity>} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.previewWrap, { borderRadius: layout.radius.md }]}>
          {noFields ? (
            <Text style={[TYPE.body, { color: colors.textSecondary }]}>Pick at least one thing to show.</Text>
          ) : preview ? (
            <Image source={{ uri: preview }} style={{ width: '70%', aspectRatio: ASPECT[shape], borderRadius: layout.radius.sm }} accessibilityLabel="Card preview" />
          ) : <ActivityIndicator color={colors.primary} />}
        </View>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {(['story', 'post', 'square'] as CardShape[]).map((s) => {
            const on = s === shape;
            return (
              <TouchableOpacity key={s} onPress={() => pickShape(s)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                style={[styles.chip, { borderRadius: layout.radius.xl, borderColor: on ? colors.textPrimary : colors.border, backgroundColor: on ? colors.textPrimary : 'transparent' }]}>
                <Text style={[TYPE.bodyStrong, { color: on ? colors.background : colors.textSecondary }]}>{s === 'story' ? 'Story' : s === 'post' ? 'Post' : 'Square'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[TYPE.caption, styles.section]}>On this card</Text>
        <View style={[styles.group, { borderRadius: layout.radius.md }]}>
          {FIELDS.map((f) => (
            <View key={f} style={styles.row}>
              <Text style={[TYPE.body, { color: colors.textPrimary }]}>{FIELD_LABELS[f]}</Text>
              <Switch value={!!fields?.includes(f)} onValueChange={() => toggle(f)} accessibilityLabel={FIELD_LABELS[f]} />
            </View>
          ))}
        </View>
        <View style={[styles.group, styles.linkGroup, { borderRadius: layout.radius.md }]}>
          <View style={styles.row}>
            <Text style={[TYPE.body, { color: colors.textPrimary, flex: 1 }]}>Make a link to this card</Text>
            <Switch value={link} onValueChange={onLinkChange} accessibilityLabel="Make a link to this card" />
          </View>
          <Text style={[TYPE.caption, styles.hint]}>Shows only this card. Doesn&apos;t change who can see your animals.</Text>
          {shownLink ? (
            <View style={styles.linkBox}>
              <View style={styles.linkLine}>
                <Text style={[TYPE.body, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1} selectable>{shownLink}</Text>
                <TouchableOpacity onPress={copyLink} accessibilityRole="button" accessibilityLabel="Copy link" style={styles.copyBtn}>
                  <Text style={[TYPE.bodyStrong, { color: colors.accent }]}>{copied ? 'Copied' : 'Copy link'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={[TYPE.caption, { color: colors.textSecondary }]}>Only this card is visible at this link. Turn it off any time in Sharing → Shared cards.</Text>
            </View>
          ) : null}
        </View>
        {error ? <Text style={[TYPE.caption, { color: colors.danger }]} accessibilityRole="alert">{error}</Text> : null}
        <View style={styles.actions}>
          <TouchableOpacity onPress={onSave} disabled={disabled} style={[styles.btn, { borderRadius: layout.radius.md, borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]} accessibilityRole="button" accessibilityState={{ disabled }}>
            {busy === 'save' ? <ActivityIndicator color={colors.textPrimary} /> : <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>Save</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onShare} disabled={disabled} style={[styles.btn, { borderRadius: layout.radius.md, backgroundColor: colors.textPrimary, borderColor: colors.textPrimary, opacity: disabled ? 0.5 : 1 }]} accessibilityRole="button" accessibilityState={{ disabled }}>
            {busy === 'share' ? <ActivityIndicator color={colors.background} /> : <Text style={[TYPE.bodyStrong, { color: colors.background }]}>Share</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16, gap: 12, paddingBottom: 48 },
  previewWrap: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, paddingVertical: 16, minHeight: 240 },
  chips: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  chip: { borderWidth: 1, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center' },
  section: { color: colors.textTertiary, marginTop: 4 },
  group: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  linkGroup: { paddingBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, minHeight: 48 },
  hint: { color: colors.textSecondary, paddingHorizontal: 14 },
  linkBox: { paddingHorizontal: 14, gap: 4 },
  linkLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  copyBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1, minHeight: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
