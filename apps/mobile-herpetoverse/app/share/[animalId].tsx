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
import { FrameRow } from '../../src/components/share/FrameRow';
import { PhotoStrip } from '../../src/components/share/PhotoStrip';
import { PhotoAdjuster } from '../../src/components/share/PhotoAdjuster';
import { AppHeader } from '../../src/components/AppHeader';
import {
  CardFrame, CardShape, FIELDS, FIELD_LABELS, FRAMES, PHOTO_ASPECT, PhotoFocus, SharePhoto, focusKey,
  createShareCard, getShareDefaults, listSharePhotos, previewImageUrl, shareImageUrl,
} from '../../src/lib/share-cards';

const ASPECT: Record<CardShape, number> = { story: 1080 / 1920, post: 1080 / 1350, square: 1 };

// Preview tokens last 15 minutes; reuse a cached preview for a bit less.
const PREVIEW_TTL_MS = 12 * 60 * 1000;
const previewKey = (f: string[], s: CardShape, fr: CardFrame, ph: string | null, fo: PhotoFocus | null) =>
  `${[...f].sort().join(',')}|${s}|${fr}|${ph ?? 'main'}|${focusKey(fo)}`;

/** A card link made in this screen session, reusable while frame+fields+shape+photo are unchanged. */
interface MadeLink { key: string; cardLink: string }

export default function ShareCardScreen() {
  const router = useRouter();
  const { animalId } = useLocalSearchParams<{ animalId: string }>();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [shape, setShape] = useState<CardShape>('story');
  const [frame, setFrame] = useState<CardFrame>('specimen');
  const [fields, setFields] = useState<string[] | null>(null);
  const [link, setLink] = useState(false);
  // The preview remembers its shape so a new shape never shows a stretched old image.
  const [preview, setPreview] = useState<{ uri: string; shape: CardShape } | null>(null);
  const [photos, setPhotos] = useState<SharePhoto[]>([]);
  // null = the animal's main photo.
  const [photoId, setPhotoId] = useState<string | null>(null);
  // The keeper's framing for that photo; null = automatic.
  const [focus, setFocus] = useState<PhotoFocus | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  // Previews already drawn this session, so going back to a frame/shape/photo is instant.
  const cache = useRef(new Map<string, { uri: string; at: number }>());
  const prefetched = useRef<string | null>(null);
  // The image actually on screen; re-selecting it fires no new load event.
  const loadedUri = useRef<string | null>(null);
  // True from a change until the new image has actually loaded (the server takes a few seconds to draw it).
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);
  const madeLink = useRef<MadeLink | null>(null);
  const [shownLink, setShownLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const noFields = fields !== null && fields.length === 0;

  useEffect(() => {
    getShareDefaults()
      .then((d) => { setFields(d.fields); setFrame(d.frame); })
      .catch(() => setFields(FIELDS));
  }, []);

  useEffect(() => {
    if (!animalId) return;
    listSharePhotos(animalId).then(setPhotos).catch(() => setPhotos([]));
  }, [animalId]);

  const cached = (k: string) => {
    const hit = cache.current.get(k);
    return hit && Date.now() - hit.at < PREVIEW_TTL_MS ? hit.uri : null;
  };
  const requestPreview = async (f: string[], s: CardShape, fr: CardFrame, ph: string | null, fo: PhotoFocus | null) => {
    const r = await createShareCard({ animal_id: animalId, fields: f, shape: s, frame: fr, photo_id: ph, focus: fo, link: false, preview: true });
    return previewImageUrl(r.image_url);
  };

  useEffect(() => {
    if (!fields || !animalId) return;
    if (timer.current) clearTimeout(timer.current);
    // Any change invalidates responses still in flight.
    const mine = ++reqId.current;
    if (fields.length === 0) {
      setPreview(null);
      setLoading(false);
      setError(null);
      return;
    }
    const k = previewKey(fields, shape, frame, photoId, focus);
    const hit = cached(k);
    setError(null);
    // Keep the old image on screen (dimmed) while the new one draws.
    setLoading(true);
    if (hit) {
      setPreview({ uri: hit, shape });
      if (hit === loadedUri.current) setLoading(false);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const uri = await requestPreview(fields, shape, frame, photoId, focus);
        cache.current.set(k, { uri, at: Date.now() });
        if (mine === reqId.current) setPreview({ uri, shape });
      } catch {
        if (mine === reqId.current) { setPreview(null); setLoading(false); setError("Couldn't make the card. Try again."); }
      }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [fields, shape, frame, photoId, focus, animalId]);

  /** Once the current preview is on screen, quietly draw the other two frames
   *  so switching frame is instant. Runs once per fields/shape/photo combination. */
  const prefetchOtherFrames = () => {
    if (!fields || fields.length === 0) return;
    const combo = previewKey(fields, shape, 'specimen', photoId, focus);
    if (prefetched.current === combo) return;
    prefetched.current = combo;
    const f = fields, s = shape, ph = photoId, fo = focus;
    FRAMES.filter((x) => x.key !== frame).forEach(async ({ key: fr }) => {
      const k = previewKey(f, s, fr, ph, fo);
      if (cached(k)) return;
      try {
        const uri = await requestPreview(f, s, fr, ph, fo);
        cache.current.set(k, { uri, at: Date.now() });
        await Image.prefetch(uri);
      } catch { /* best effort */ }
    });
  };

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

  const linkKey = previewKey;

  const toggle = (f: string) => {
    madeLink.current = null;
    setShownLink(null);
    setFields((cur) => ((cur ?? []).includes(f) ? (cur ?? []).filter((x) => x !== f) : [...(cur ?? []), f]));
  };
  const pickShape = (s: CardShape) => { madeLink.current = null; setShownLink(null); setShape(s); };
  const pickFrame = (f: CardFrame) => { madeLink.current = null; setShownLink(null); setFrame(f); };
  // A new photo starts from automatic framing: the old focus point belonged to the old photo.
  const pickPhoto = (id: string | null) => { madeLink.current = null; setShownLink(null); setPhotoId(id); setFocus(null); };
  const applyFocus = (fo: PhotoFocus | null) => { madeLink.current = null; setShownLink(null); setFocus(fo); setAdjusting(false); };
  const currentPhoto = photos.find((ph) => (photoId ? ph.id === photoId : ph.is_main)) ?? null;
  const onLinkChange = (v: boolean) => { if (!v) { madeLink.current = null; setShownLink(null); } setLink(v); };

  const produce = async (): Promise<{ file: string; cardLink: string | null }> => {
    const key = linkKey(fields!, shape, frame, photoId, focus);
    const reuse = link && madeLink.current?.key === key ? madeLink.current : null;
    const r = await createShareCard({ animal_id: animalId!, fields: fields!, shape, frame, photo_id: photoId, focus, link: link && !reuse });
    if (link && r.card_link) madeLink.current = { key, cardLink: r.card_link };
    // Full-size JPEG: ~10x smaller than the PNG, indistinguishable on a feed.
    const file = `${FileSystem.cacheDirectory}share-card-${Date.now()}.jpg`;
    const dl = await FileSystem.downloadAsync(shareImageUrl(r.image_url), file);
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
      await Sharing.shareAsync(file, { mimeType: 'image/jpeg', dialogTitle: 'Share card', UTI: 'public.jpeg' });
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
          ) : preview && preview.shape === shape ? (
            <View style={styles.previewFrame} accessibilityState={{ busy: loading }}>
              <Image
                source={{ uri: preview.uri }}
                style={{ width: '100%', aspectRatio: ASPECT[preview.shape], borderRadius: layout.radius.sm, opacity: loading ? 0.45 : 1 }}
                onLoadEnd={() => { loadedUri.current = preview.uri; setLoading(false); prefetchOtherFrames(); }}
                accessibilityLabel={loading ? 'Updating card preview' : 'Card preview'}
              />
              {loading ? <View style={styles.previewSpinner} pointerEvents="none"><ActivityIndicator color={colors.primary} size="large" /></View> : null}
            </View>
          ) : (
            <View style={styles.previewEmpty} accessibilityLabel="Preparing card preview">
              <ActivityIndicator color={colors.primary} />
              <Text style={[TYPE.caption, { color: colors.textSecondary }]}>Drawing your card…</Text>
            </View>
          )}
        </View>
        <FrameRow value={frame} onChange={pickFrame} />
        {photos.length > 1 && fields?.includes('photo') ? <PhotoStrip photos={photos} value={photoId} onChange={pickPhoto} /> : null}
        {currentPhoto && fields?.includes('photo') ? (
          <TouchableOpacity onPress={() => setAdjusting(true)} accessibilityRole="button" style={[styles.adjustBtn, { borderRadius: layout.radius.md }]}>
            <MaterialCommunityIcons name="crop" size={18} color={colors.textPrimary} />
            <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>{focus ? 'Adjust photo (custom)' : 'Adjust photo'}</Text>
          </TouchableOpacity>
        ) : null}
        <PhotoAdjuster
          visible={adjusting}
          uri={currentPhoto?.url ?? null}
          aspect={PHOTO_ASPECT[frame][shape]}
          value={focus}
          onCancel={() => setAdjusting(false)}
          onDone={applyFocus}
        />
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
  adjustBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderWidth: 1, borderColor: colors.border, alignSelf: 'center', paddingHorizontal: 16 },
  previewFrame: { width: '70%', alignItems: 'center', justifyContent: 'center' },
  previewSpinner: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  previewEmpty: { alignItems: 'center', gap: 8 },
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
