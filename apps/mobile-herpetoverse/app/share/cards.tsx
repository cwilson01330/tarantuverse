/** Your shared cards — every card link you made, with a way to turn each off. */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { TYPE } from '../../src/theme/type';
import { AppHeader } from '../../src/components/AppHeader';
import { CardLinkItem, cardKindLabel, listCardLinks, revokeCardLink } from '../../src/lib/share-cards';

export default function SharedCardsScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const [items, setItems] = useState<CardLinkItem[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    listCardLinks().then((d) => { setItems(d); setError(false); }).catch(() => setError(true));
  }, []);
  useFocusEffect(load);
  const shown = items ? items.filter((c) => c.app === 'herpetoverse') : null;
  const madeOn = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const turnOff = (c: CardLinkItem) => Alert.alert('Turn off this link?', 'Anyone with the link will see that the card is no longer shared.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Turn off', style: 'destructive', onPress: () => { revokeCardLink(c.code).then(load).catch(() => Alert.alert("Couldn't turn it off. Try again.")); } },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Shared cards" leftAction={<TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back"><MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} /></TouchableOpacity>} />
      {error ? (
        <View style={styles.pad}>
          <Text style={[TYPE.body, { color: colors.textSecondary }]}>Couldn&apos;t load your shared cards.</Text>
          <TouchableOpacity onPress={load} accessibilityRole="button" style={styles.off}>
            <Text style={[TYPE.bodyStrong, { color: colors.accent }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={shown ?? []}
          keyExtractor={(c) => c.code}
          contentContainerStyle={styles.pad}
          ListEmptyComponent={shown ? <Text style={[TYPE.body, { color: colors.textSecondary }]}>Card links you make appear here.</Text> : <ActivityIndicator color={colors.primary} />}
          renderItem={({ item: c }) => (
            <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
              <View style={{ flex: 1 }}>
                <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>{c.name || 'Animal'} · {cardKindLabel(c.kind)}</Text>
                <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={1}>{madeOn(c.created_at)} · {c.revoked_at ? 'Off' : c.url}</Text>
              </View>
              {!c.revoked_at ? (
                <TouchableOpacity onPress={() => turnOff(c)} accessibilityRole="button" accessibilityLabel={`Turn off link for ${c.name || 'this card'}`} style={styles.off}>
                  <Text style={[TYPE.bodyStrong, { color: colors.accent }]}>Turn off</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, padding: 12, gap: 8 },
  off: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
