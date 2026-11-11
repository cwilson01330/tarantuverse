/**
 * Small themed toast for notification-button results (Effortless logging).
 * `showReminderToast(text)` is a module-level emitter so the notification
 * handler (which lives outside React) can raise it. Colours: ThemeContext only.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/tokens';

type Listener = (text: string) => void;
const listeners = new Set<Listener>();

export function showReminderToast(text: string): void {
  listeners.forEach((fn) => fn(text));
}

const VISIBLE_MS = 3000;

export function ReminderToast() {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onShow: Listener = (t) => {
      if (timer.current) clearTimeout(timer.current);
      setText(t);
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setText(null));
      }, VISIBLE_MS);
    };
    listeners.add(onShow);
    return () => {
      listeners.delete(onShow);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [opacity]);

  if (!text) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <Animated.View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          { opacity, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md },
        ]}
      >
        <Text style={[styles.text, { color: colors.textPrimary }]}>{text}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 1000 },
  toast: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 480 },
  text: { ...TYPE.bodyStrong, textAlign: 'center' },
});
