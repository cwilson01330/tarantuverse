import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { SPACING } from '../../theme/tokens';
import { Card } from '../ui';
import { useTheme } from '../../contexts/ThemeContext';

/** Pulse: 1.4s between .55 and 1 opacity (README), still at .8 when the system asks for reduced motion. */
function usePulse(): Animated.Value | number {
  const opacity = useRef(new Animated.Value(1)).current;
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (reduced) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);

  return reduced ? 0.8 : opacity;
}

function Block({ height }: { height: number }) {
  const { layout } = useTheme();
  return <Card style={{ height, borderRadius: layout.radius.lg }}>{null}</Card>;
}

/**
 * Loading shapes for the first four cards (three 74pt tiles, 200, 120, 120).
 * No text and no numbers: a number here would read as data (a `0` while loading).
 */
export function AnalyticsSkeleton() {
  const opacity = usePulse();
  const { layout } = useTheme();
  return (
    <Animated.View
      accessible
      accessibilityLabel="Loading analytics"
      accessibilityState={{ busy: true }}
      style={[styles.stack, { opacity }]}
    >
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Card style={{ height: 74, borderRadius: layout.radius.md }}>{null}</Card>
        </View>
        <View style={{ flex: 1 }}>
          <Card style={{ height: 74, borderRadius: layout.radius.md }}>{null}</Card>
        </View>
        <View style={{ flex: 1 }}>
          <Card style={{ height: 74, borderRadius: layout.radius.md }}>{null}</Card>
        </View>
      </View>
      <Block height={200} />
      <Block height={120} />
      <Block height={120} />
    </Animated.View>
  );
}

/** One pulse block for the Premium slot while its data (or the plan) is still loading. */
export function PremiumSkeleton() {
  const opacity = usePulse();
  return (
    <Animated.View
      accessible
      accessibilityLabel="Loading Premium insights"
      accessibilityState={{ busy: true }}
      style={{ opacity }}
    >
      <Block height={200} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACING.md },
  row: { flexDirection: 'row', gap: SPACING.sm },
});
