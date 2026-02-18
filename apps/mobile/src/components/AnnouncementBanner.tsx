import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../services/api';

interface Announcement {
  id: string;
  title: string;
  message: string;
  banner_type: 'info' | 'sale' | 'update' | 'coupon';
  link_url?: string | null;
  link_text?: string | null;
  coupon_code?: string | null;
}

const typeConfig = {
  sale: { icon: '🏷️', accentColor: '#22c55e' },
  coupon: { icon: '🎟️', accentColor: '#a855f7' },
  update: { icon: '📢', accentColor: '#3b82f6' },
  info: { icon: 'ℹ️', accentColor: '#6b7280' },
};

export default function AnnouncementBanner() {
  const { colors } = useTheme();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchAnnouncement();
  }, []);

  const fetchAnnouncement = async () => {
    try {
      const res = await apiClient.get('/announcements/active');
      const data = res.data;
      if (!data) return;

      const dismissedKey = `dismissed_announcement_${data.id}`;
      const wasDismissed = await AsyncStorage.getItem(dismissedKey);
      if (wasDismissed) return;

      setAnnouncement(data);
    } catch {
      // Silently fail
    }
  };

  const handleDismiss = async () => {
    if (announcement) {
      await AsyncStorage.setItem(`dismissed_announcement_${announcement.id}`, 'true');
    }
    setDismissed(true);
  };

  const handleCopy = async () => {
    if (announcement?.coupon_code) {
      await Clipboard.setStringAsync(announcement.coupon_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLink = () => {
    if (announcement?.link_url) {
      Linking.openURL(announcement.link_url);
    }
  };

  if (!announcement || dismissed) return null;

  const config = typeConfig[announcement.banner_type] || typeConfig.info;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderLeftColor: config.accentColor,
        },
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.icon}>{config.icon}</Text>

        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {announcement.title}
          </Text>
          <Text style={[styles.message, { color: colors.textSecondary }]} numberOfLines={2}>
            {announcement.message}
          </Text>
        </View>

        <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ color: colors.textTertiary, fontSize: 18 }}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Action row */}
      {(announcement.coupon_code || announcement.link_url) && (
        <View style={styles.actions}>
          {announcement.coupon_code && (
            <TouchableOpacity
              onPress={handleCopy}
              style={[styles.couponButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <Text style={[styles.couponText, { color: colors.textPrimary }]}>
                {announcement.coupon_code}
              </Text>
              <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                {copied ? '✓' : '📋'}
              </Text>
            </TouchableOpacity>
          )}

          {announcement.link_url && (
            <TouchableOpacity onPress={handleLink} style={styles.linkButton}>
              <Text style={styles.linkText}>
                {announcement.link_text || 'Learn More'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  icon: {
    fontSize: 18,
    marginTop: 1,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginLeft: 28,
  },
  couponButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  couponText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  linkButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#8B5CF6',
  },
  linkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});
