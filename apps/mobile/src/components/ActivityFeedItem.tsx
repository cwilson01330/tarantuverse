import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

export type ActionType =
  | 'new_tarantula'
  | 'molt'
  | 'feeding'
  | 'follow'
  | 'forum_thread'
  | 'forum_post';

export interface ActivityFeedItemData {
  id: number;
  user_id: string;
  action_type: ActionType;
  target_type: string;
  target_id: string | null;
  activity_metadata: Record<string, any> | null;
  created_at: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props {
  activity: ActivityFeedItemData;
}

export default function ActivityFeedItem({ activity }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
  };

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const getActivityIcon = (): { name: string; color: string } => {
    switch (activity.action_type) {
      case 'new_tarantula': return { name: 'spider', color: '#9333ea' };
      case 'molt':          return { name: 'spider', color: '#3b82f6' };
      case 'feeding':       return { name: 'food-apple', color: '#10b981' };
      case 'follow':        return { name: 'account-plus', color: '#ec4899' };
      case 'forum_thread':  return { name: 'message-text', color: '#f97316' };
      case 'forum_post':    return { name: 'message-reply', color: '#14b8a6' };
      default:              return { name: 'information', color: colors.textTertiary };
    }
  };

  const getActivityContent = () => {
    const meta = activity.activity_metadata ?? {};
    const displayName = activity.display_name || activity.username;

    switch (activity.action_type) {
      case 'new_tarantula':
        return {
          verb: `${displayName} added`,
          tarantulaName: meta.tarantula_name ?? meta.name,
          speciesName: meta.species_name ?? meta.common_name ?? meta.scientific_name,
          thumbnailUrl: meta.thumbnail_url,
          subtitle: undefined,
          onPress: () => router.push(`/tarantula/${meta.tarantula_id ?? activity.target_id}`),
        };

      case 'molt':
        return {
          verb: `${displayName} logged a molt for`,
          tarantulaName: meta.tarantula_name,
          speciesName: meta.species_name,
          thumbnailUrl: meta.thumbnail_url,
          subtitle: meta.leg_span_after ? `New leg span: ${meta.leg_span_after}"` : undefined,
          onPress: () => router.push(`/tarantula/${meta.tarantula_id ?? activity.target_id}`),
        };

      case 'feeding': {
        const accepted = meta.accepted;
        return {
          verb: `${displayName} fed`,
          tarantulaName: meta.tarantula_name,
          speciesName: meta.species_name,
          thumbnailUrl: meta.thumbnail_url,
          subtitle: meta.food_type
            ? `${meta.food_type} — ${accepted ? '✓ Accepted' : '✗ Rejected'}`
            : undefined,
          subtitleColor: accepted ? '#10b981' : '#ef4444',
          onPress: () => router.push(`/tarantula/${meta.tarantula_id ?? activity.target_id}`),
        };
      }

      case 'follow':
        return {
          verb: `${displayName} followed ${meta.followed_username}`,
          tarantulaName: undefined,
          speciesName: undefined,
          thumbnailUrl: undefined,
          subtitle: undefined,
          onPress: () => router.push(`/keeper/${meta.followed_username}`),
        };

      case 'forum_thread':
        return {
          verb: `${displayName} started a thread`,
          tarantulaName: meta.thread_title,
          speciesName: `in ${meta.category_name}`,
          thumbnailUrl: undefined,
          subtitle: undefined,
          onPress: () => router.push(`/forums/thread/${activity.target_id}`),
        };

      case 'forum_post':
        return {
          verb: `${displayName} replied to`,
          tarantulaName: meta.thread_title,
          speciesName: undefined,
          thumbnailUrl: undefined,
          subtitle: undefined,
          onPress: () => router.push(`/forums/thread/${meta.thread_id}`),
        };

      default:
        return {
          verb: `${displayName} did something`,
          tarantulaName: undefined,
          speciesName: undefined,
          thumbnailUrl: undefined,
          subtitle: undefined,
        };
    }
  };

  const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';

  const icon = getActivityIcon();
  const content = getActivityContent();

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={content.onPress}
      disabled={!content.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${content.verb}${content.tarantulaName ? ` ${content.tarantulaName}` : ''}`}
    >
      <View style={styles.row}>
        {/* Activity type icon */}
        <View style={[styles.iconContainer, { backgroundColor: icon.color }]}>
          <MaterialCommunityIcons name={icon.name as any} size={18} color="#fff" />
        </View>

        {/* Tarantula thumbnail (if available) */}
        {content.thumbnailUrl ? (
          <Image
            source={{ uri: content.thumbnailUrl.startsWith('http') ? content.thumbnailUrl : `${API_BASE}${content.thumbnailUrl}` }}
            style={styles.thumbnail}
            accessibilityLabel={content.tarantulaName ?? 'Tarantula photo'}
          />
        ) : content.tarantulaName && (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={{ fontSize: 18 }}>🕷️</Text>
          </View>
        )}

        {/* Text content */}
        <View style={styles.textContent}>
          <Text style={[styles.verb, { color: colors.textSecondary }]} numberOfLines={1}>
            {content.verb}
          </Text>

          {content.tarantulaName && (
            <Text style={[styles.tarantulaName, { color: colors.textPrimary }]} numberOfLines={1}>
              {content.tarantulaName}
            </Text>
          )}

          {content.speciesName && (
            <Text style={[styles.speciesName, { color: colors.textTertiary }]} numberOfLines={1}>
              {content.speciesName}
            </Text>
          )}

          {content.subtitle && (
            <Text
              style={[styles.subtitle, { color: (content as any).subtitleColor || colors.textTertiary }]}
              numberOfLines={1}
            >
              {content.subtitle}
            </Text>
          )}

          <Text style={[styles.time, { color: colors.textTertiary }]}>
            {formatTimeAgo(activity.created_at)}
          </Text>
        </View>

        {/* User avatar */}
        {activity.avatar_url ? (
          <Image
            source={{ uri: activity.avatar_url }}
            style={styles.avatar}
            accessibilityLabel={`${activity.display_name || activity.username}'s avatar`}
          />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {getInitials(activity.display_name || activity.username)}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    gap: 10,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    flexShrink: 0,
  },
  thumbnailPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContent: {
    flex: 1,
    minWidth: 0,
  },
  verb: {
    fontSize: 13,
    lineHeight: 17,
  },
  tarantulaName: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  speciesName: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 17,
    marginTop: 2,
  },
  time: {
    fontSize: 12,
    marginTop: 4,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
});
