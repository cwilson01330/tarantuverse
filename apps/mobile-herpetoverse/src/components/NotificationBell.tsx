/**
 * NotificationBell — bell icon with an unread badge for the Herpetoverse
 * mobile header. Taps through to the notification center
 * (`/notification-center`). Polls the unread count on focus + every 30s.
 *
 * Mirrors the proven Tarantuverse mobile bell. Styled with ThemeContext
 * colors (this app is dark-first); the badge uses `colors.danger`.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { fetchUnreadCount } from '../lib/notifications';

interface NotificationBellProps {
  color?: string;
  size?: number;
}

export function NotificationBell({ color, size = 22 }: NotificationBellProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setCount(await fetchUnreadCount());
    } catch {
      // non-fatal — the bell just shows no badge on failure
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      const t = setInterval(refresh, 30000);
      return () => clearInterval(t);
    }, [refresh]),
  );

  return (
    <TouchableOpacity
      onPress={() => router.push('/notification-center' as never)}
      hitSlop={8}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
    >
      <MaterialCommunityIcons
        name="bell-outline"
        size={size}
        color={color ?? colors.textPrimary}
      />
      {count > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.danger }]}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default NotificationBell;

const styles = StyleSheet.create({
  wrap: {
    width: 44,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700', lineHeight: 12 },
});
