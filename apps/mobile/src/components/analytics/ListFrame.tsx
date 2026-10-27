import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { AppHeader } from '../AppHeader';
import { SPACING, TYPE } from '../../theme/tokens';
import { SEMANTIC_COLORS } from '../../lib/analytics-view';
import type { LoadStatus } from '../../lib/analytics-page-state';
import { AnalyticsCard, MIN_TOUCH, ON_PRIMARY, OutlineButton } from './parts';

/**
 * The frame of the two "see all" screens (Species, Molts): header with a back
 * button, a quiet loading block, the error card with Try again, else `children`.
 * Never the empty copy after a failed fetch.
 */
export function ListFrame({
  title,
  subtitle,
  status,
  errorTitle,
  onRetry,
  children,
}: {
  title: string;
  /** Shown under the title once loaded; "—" is used on error and nothing while loading. */
  subtitle?: string;
  status: LoadStatus;
  errorTitle: string;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? ON_PRIMARY : colors.textPrimary;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/analytics' as never));
  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppHeader
        title={title}
        subtitle={status === 'ready' ? subtitle : status === 'error' ? '—' : undefined}
        leftAction={
          <TouchableOpacity
            onPress={goBack}
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
          </TouchableOpacity>
        }
      />
      {status === 'loading' && (
        <View style={styles.pad}>
          <View
            accessible
            accessibilityLabel={`Loading ${title.toLowerCase()}`}
            accessibilityState={{ busy: true }}
            style={{ height: 240, borderRadius: layout.radius.lg, backgroundColor: colors.surface, opacity: 0.7 }}
          />
        </View>
      )}
      {status === 'error' && (
        <View style={styles.pad}>
          <AnalyticsCard style={styles.errorCard}>
            <MaterialCommunityIcons name="alert-outline" size={34} color={SEMANTIC_COLORS.warning} />
            <Text accessibilityRole="header" style={[styles.errorTitle, { color: colors.textPrimary }]}>
              {errorTitle}
            </Text>
            <Text style={[styles.errorBody, { color: colors.textSecondary }]}>
              Your records are fine. This is a connection problem.
            </Text>
            <OutlineButton label="Try again" onPress={onRetry} />
          </AnalyticsCard>
        </View>
      )}
      {status === 'ready' && children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: SPACING.lg },
  back: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, justifyContent: 'center' },
  errorCard: { alignItems: 'center', paddingVertical: SPACING.xxl, gap: SPACING.sm },
  errorTitle: { ...TYPE.subheadingBold, textAlign: 'center' },
  errorBody: { ...TYPE.small, textAlign: 'center', marginBottom: SPACING.xs },
});
