/**
 * "Adjust photo" for share cards: drag to move, pinch (or -/+) to zoom,
 * inside a window shaped like the card's photo slot. Returns a focus point
 * (the part of the photo to centre) and a zoom, which the renderer crops
 * around for every frame and shape. Built on PanResponder so it needs no
 * native gesture library (ships over the air).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, PanResponder, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { TYPE } from '../../theme/type';
import { PhotoFocus } from '../../lib/share-cards';

const CENTRE: PhotoFocus = { x: 0.5, y: 0.5, zoom: 1 };
const clampZoom = (z: number) => Math.min(4, Math.max(1, z));

interface Props {
  visible: boolean;
  uri: string | null;
  /** width / height of the card's photo window */
  aspect: number;
  value: PhotoFocus | null;
  onCancel: () => void;
  /** null = go back to automatic framing */
  onDone: (focus: PhotoFocus | null) => void;
}

export function PhotoAdjuster({ visible, uri, aspect, value, onCancel, onDone }: Props) {
  const { colors, layout } = useTheme();
  const { width: sw, height: sh } = useWindowDimensions();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [focus, setFocus] = useState<PhotoFocus>(value ?? CENTRE);

  useEffect(() => { if (visible) setFocus(value ?? CENTRE); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!uri) return;
    setSize(null);
    Image.getSize(uri, (w, h) => setSize({ w, h }), () => setSize(null));
  }, [uri]);

  // The window: as wide as the screen allows, never taller than ~55% of it.
  const maxW = sw - 32;
  const maxH = sh * 0.55;
  let winW = maxW;
  let winH = maxW / aspect;
  if (winH > maxH) { winH = maxH; winW = maxH * aspect; }

  // Geometry the gesture handler reads (it is created once).
  const geo = useRef({ W: 1, H: 1, winW, winH });
  geo.current = { W: size?.w ?? 1, H: size?.h ?? 1, winW, winH };

  const clampFocus = (f: PhotoFocus): PhotoFocus => {
    const { W, H, winW: ww, winH: wh } = geo.current;
    const zoom = clampZoom(f.zoom);
    const s = Math.max(ww / W, wh / H) * zoom;
    const hx = Math.min(0.5, ww / (2 * W * s));
    const hy = Math.min(0.5, wh / (2 * H * s));
    return { zoom, x: Math.min(1 - hx, Math.max(hx, f.x)), y: Math.min(1 - hy, Math.max(hy, f.y)) };
  };

  const focusRef = useRef(focus);
  focusRef.current = focus;
  const start = useRef({ focus: CENTRE, dist: 0, touches: 0, ox: 0, oy: 0 });
  const spread = (t: readonly { pageX: number; pageY: number }[]) => (t.length < 2 ? 0 : Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY));

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const t = e.nativeEvent.touches;
      start.current = { focus: focusRef.current, dist: spread(t), touches: t.length, ox: 0, oy: 0 };
    },
    onPanResponderMove: (e, gs) => {
      const t = e.nativeEvent.touches;
      const s0 = start.current;
      // A finger added or lifted: re-anchor so nothing jumps.
      if (t.length !== s0.touches) {
        start.current = { focus: focusRef.current, dist: spread(t), touches: t.length, ox: gs.dx, oy: gs.dy };
        return;
      }
      const { W, H, winW: ww, winH: wh } = geo.current;
      if (t.length >= 2 && s0.dist > 0) {
        setFocus(clampFocus({ ...s0.focus, zoom: s0.focus.zoom * (spread(t) / s0.dist) }));
        return;
      }
      const s = Math.max(ww / W, wh / H) * s0.focus.zoom;
      setFocus(clampFocus({ ...s0.focus, x: s0.focus.x - (gs.dx - s0.ox) / (W * s), y: s0.focus.y - (gs.dy - s0.oy) / (H * s) }));
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const f = size ? clampFocus(focus) : focus;
  const s = size ? Math.max(winW / size.w, winH / size.h) * f.zoom : 1;
  const dispW = (size?.w ?? 0) * s;
  const dispH = (size?.h ?? 0) * s;
  const zoomBy = (d: number) => setFocus((cur) => clampFocus({ ...cur, zoom: cur.zoom + d }));
  const st = makeStyles(colors);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={st.screen}>
        <View style={st.top}>
          <TouchableOpacity onPress={onCancel} accessibilityRole="button" style={st.topBtn}>
            <Text style={[TYPE.bodyStrong, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[TYPE.heading, { color: colors.textPrimary }]}>Adjust photo</Text>
          <TouchableOpacity onPress={() => onDone(f)} accessibilityRole="button" style={st.topBtn} disabled={!size}>
            <Text style={[TYPE.bodyStrong, { color: colors.textPrimary, opacity: size ? 1 : 0.4 }]}>Done</Text>
          </TouchableOpacity>
        </View>
        <View style={st.middle}>
          <View
            {...pan.panHandlers}
            style={{ width: winW, height: winH, overflow: 'hidden', borderRadius: layout.radius.sm, backgroundColor: colors.surface }}
            accessibilityLabel="Photo. Drag to move, pinch to zoom."
          >
            {uri && size ? (
              <Image source={{ uri }} style={{ position: 'absolute', width: dispW, height: dispH, left: winW / 2 - f.x * dispW, top: winH / 2 - f.y * dispH }} />
            ) : <View style={st.loading}><ActivityIndicator color={colors.primary} /></View>}
          </View>
          <Text style={[TYPE.caption, { color: colors.textSecondary }]}>Drag to move · pinch to zoom</Text>
          <View style={st.zoomRow}>
            <TouchableOpacity onPress={() => zoomBy(-0.25)} accessibilityRole="button" accessibilityLabel="Zoom out" style={[st.zoomBtn, { borderRadius: layout.radius.xl }]}>
              <Text style={[TYPE.heading, { color: colors.textPrimary }]}>−</Text>
            </TouchableOpacity>
            <Text style={[TYPE.body, { color: colors.textSecondary, minWidth: 56, textAlign: 'center' }]}>{f.zoom.toFixed(1)}×</Text>
            <TouchableOpacity onPress={() => zoomBy(0.25)} accessibilityRole="button" accessibilityLabel="Zoom in" style={[st.zoomBtn, { borderRadius: layout.radius.xl }]}>
              <Text style={[TYPE.heading, { color: colors.textPrimary }]}>+</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => onDone(null)} accessibilityRole="button" style={st.autoBtn}>
            <Text style={[TYPE.bodyStrong, { color: colors.textSecondary }]}>Use automatic framing</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingTop: 48 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 52 },
  topBtn: { minHeight: 44, minWidth: 64, justifyContent: 'center' },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  zoomBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  autoBtn: { minHeight: 44, justifyContent: 'center' },
});
