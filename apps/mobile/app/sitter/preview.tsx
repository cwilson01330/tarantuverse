/**
 * Preview as sitter — the exact payload the sitter's page receives, rendered
 * with the same view (PRD-shared-keeping).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import SitterPassView from '../../src/components/SitterPassView';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { TYPE } from '../../src/theme/tokens';
import { passErrorMessage, sitterApi, type Payload } from '../../src/lib/sitter-passes';

function SitterPreviewScreen() {
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    sitterApi.preview(String(id)).then(setData).catch((e) => setError(passErrorMessage(e)));
  }, [id]);

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Preview as sitter"
        subtitle="Exactly what they'll see"
        leftAction={
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {error && <Text style={[TYPE.body, { color: colors.error }]}>{error}</Text>}
        {!data && !error && <ActivityIndicator color={colors.primary} />}
        {data && <SitterPassView data={data} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
});

export default withErrorBoundary(SitterPreviewScreen, 'sitter-preview');
