import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
  target_id: string | null; // Changed to string to support UUIDs
  activity_metadata: Record<string, any> | null; // Renamed from metadata to match backend
  created_at: string;
  username: string; // From backend response
  display_name: string | null; // From backend response
  avatar_url: string | null; // From backend response
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

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getActivityIcon = (): { name: string; color: string } => {
    switch (activity.action_type) {
      case 'new_tarantula':
        return { name: 'spider', color: '#9333ea' };
      case 'molt':
        return { name: 'spider', color: '#3b82f6' };
      case 'feeding':
        return { name: 'food-apple', color: '#10b981' };
      case 'follow':
        return { name: 'account-plus', color: '#ec4899' };
      case 'forum_thread':
        return { name: 'message-text', color: '#f97316' };
      case 'forum_post':
        return { name: 'message-reply', color: '#14b8a6' };
      default:
        return { name: 'information', color: colors.textTertiary };
    }
  };

  const getActivityContent = () => {
    const displayName = activity.display_name || activity.username;

    switch (activity.action_type) {
      case 'new_tarantula':
        return {
          title: `${displayName} added a new tarantula`,
          description: activity.activity_metadata.tarantula_name,
          subtitle: activity.activity_metadata.species_name || undefined,
          onPress: () => router.push(`/tarantula/${activity.target_id}`),
        };

      case 'molt':
        return {
          title: `${displayName} logged a molt`,
          description: activity.activity_metadata.tarantula_name,
          subtitle: activity.activity_metadata.leg_span_after
            ? `New leg span: ${activity.activity_metadata.leg_span_after}"`
            : undefined,
          onPress: () => router.push(`/tarantula/${activity.activity_metadata.tarantula_id}`),
        };

      case 'feeding':
        const accepted = activity.activity_metadata.accepted;
        return {
          title: `${displayName} logged a feeding`,
          description: activity.activity_metadata.tarantula_name,
          subtitle: `${activity.activity_metadata.food_type} - ${accepted ? '✓ Accepted' : '✗ Rejected'}`,
          subtitleColor: accepted ? '#10b981' : '#ef4444',
          onPress: () => router.push(`/tarantula/${activity.activity_metadata.tarantula_id}`),
        };

      case 'follow':
        return {
          title: `${displayName} followed ${activity.activity_metadata.followed_username}`,
          description: undefined,
          onPress: () => router.push(`/keeper/${activity.activity_metadata.followed_username}`),
        };

      case 'forum_thread':
        return {
          title: `${displayName} started a new thread`,
          description: activity.activity_metadata.thread_title,
          subtitle: `in ${activity.activity_metadata.category_name}`,
          onPress: () => router.push(`/forums/thread/${activity.target_id}`),
        };

      case 'forum_post':
        return {
          title: `${displayName} replied to a thread`,
          description: activity.activity_metadata.thread_title,
          onPress: () => router.push(`/forums/thread/${activity.activity_metadata.thread_id}`),
        };

      default:
        return {
          title: `${displayName} did something`,
          description: undefined,
        };
    }
  };

  const icon = getActivityIcon();
  const content = getActivityContent();

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={content.onPress}
      disabled={!content.onPress}
    >
      <View style={styles.content}>
        {/* Icon */}
        <View style={[styles.iconContainer, { backgroundColor: icon.color }]}>
          <MaterialCommunityIcons name={icon.name as any} size={20} color="#fff" />
        </View>

        {/* Content */}
        <View style={styles.textContent}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {content.title}
          </Text>

          {content.description && (
            <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
              {content.description}
            </Text>
          )}

          {content.subtitle && (
            <Text
              style={[
                styles.subtitle,
                { color: content.subtitleColor || colors.textTertiary },
              ]}
              numberOfLines={1}
            >
              {content.subtitle}
            </Text>
          )}

          <Text style={[styles.time, { color: colors.textTertiary }]}>
            {formatTimeAgo(activity.created_at)}
          </Text>
        </View>

        {/* User Avatar */}
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{getInitials(activity.display_name || activity.username)}</Text>
        </View>
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
  content: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContent: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 20,
  },
  description: {
    fontSize: 14,
    marginBottom: 4,
    lineHeight: 18,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 4,
  },
  time: {
    fontSize: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
