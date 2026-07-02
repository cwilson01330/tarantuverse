import React, { useCallback, useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Notifications bell with an unread badge. Taps through to the notification
 * center (`/notification-center`). Polls the unread count on focus + every 30s.
 */
export function NotificationBell({ color, size = 24 }: { color?: string; size?: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const res = await apiClient.get<{ unread_count: number }>('/notifications/unread-count');
      setCount(res.data?.unread_count ?? 0);
    } catch {
      // non-fatal — bell just shows no badge
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCount();
      const t = setInterval(fetchCount, 30000);
      return () => clearInterval(t);
    }, [fetchCount])
  );

  return (
    <TouchableOpacity
      onPress={() => router.push('/notification-center' as any)}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      style={styles.wrap}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <MaterialCommunityIcons name="bell-outline" size={size} color={color ?? colors.textPrimary} />
      {count > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.error ?? '#ef4444' }]}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 8 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
