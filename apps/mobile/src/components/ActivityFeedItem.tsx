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
  | 'forum_post'
  // Herpetoverse (ADR-019). One feed serves both apps, so a shed or a
  // weigh-in on a ball python lands in the same stream as a tarantula molt.
  | 'new_animal'
  | 'shed'
  | 'weight';

/**
 * Glyph for a herp taxon.
 *
 * MDI HAS NO `lizard` GLYPH — an unknown name renders an empty box SILENTLY
 * rather than throwing, so a typo ships and nobody notices. Every name below
 * is from the design handoff's verified appendix.
 *
 * Frogs and salamanders get `paw-outline` rather than being forced into
 * `turtle`: a neutral animal mark is honest, and calling a frog a turtle is
 * the kind of small wrongness this app doesn't do.
 */
function taxonGlyph(taxon?: string | null): string {
  switch ((taxon ?? '').toLowerCase()) {
    case 'snake':    return 'snake';
    case 'turtle':
    case 'tortoise': return 'turtle';
    default:         return 'paw-outline';
  }
}

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
      // HV. `new_animal` mirrors `new_tarantula` by showing the taxon; shed
      // and weight show the ACTION, matching the glyphs those events already
      // use inside Herpetoverse so the feed and the app agree.
      case 'new_animal':
        return { name: taxonGlyph(activity.activity_metadata?.taxon), color: '#10B981' };
      case 'shed':          return { name: 'weather-windy', color: '#F59E0B' };
      case 'weight':        return { name: 'scale-bathroom', color: '#0EA5E9' };
      case 'follow':        return { name: 'account-plus', color: '#ec4899' };
      case 'forum_thread':  return { name: 'message-text', color: '#f97316' };
      case 'forum_post':    return { name: 'message-reply', color: '#14b8a6' };
      default:              return { name: 'information', color: colors.textTertiary };
    }
  };

  const getActivityContent = () => {
    const meta = activity.activity_metadata ?? {};
    const displayName = activity.display_name || activity.username;

    // Tarantula-related activities (new_tarantula / molt / feeding) tap
    // through to the PUBLIC profile route `/tarantula/public/[username]/[name]`
    // rather than the owner-only `/tarantula/[id]`. The owner-only
    // route filters by `user_id == current_user.id` at the API level,
    // so non-owners would get a 404 — the most common case in a feed
    // is seeing someone else's activity. The public profile works for
    // both own and visitor views. We skip the tap if the activity is
    // missing the tarantula_name metadata so we don't route to a
    // broken URL.
    const openTarantulaProfile = () => {
      const name = meta.tarantula_name ?? meta.name;
      if (!activity.username || !name) return undefined;
      return () =>
        router.push(
          `/tarantula/public/${activity.username}/${encodeURIComponent(String(name))}` as never,
        );
    };

    switch (activity.action_type) {
      case 'new_tarantula':
        return {
          actor: displayName,
          verb: 'added',
          tarantulaName: meta.tarantula_name ?? meta.name,
          speciesName: meta.species_name ?? meta.common_name ?? meta.scientific_name,
          thumbnailUrl: meta.thumbnail_url,
          subtitle: undefined,
          onPress: openTarantulaProfile(),
        };

      case 'molt':
        return {
          actor: displayName,
          verb: 'logged a molt for',
          tarantulaName: meta.tarantula_name,
          speciesName: meta.species_name,
          thumbnailUrl: meta.thumbnail_url,
          subtitle: meta.leg_span_after ? `New leg span: ${meta.leg_span_after}"` : undefined,
          onPress: openTarantulaProfile(),
        };

      case 'feeding': {
        const accepted = meta.accepted;
        return {
          actor: displayName,
          verb: 'fed',
          tarantulaName: meta.tarantula_name,
          speciesName: meta.species_name,
          thumbnailUrl: meta.thumbnail_url,
          subtitle: meta.food_type
            ? `${meta.food_type} — ${accepted ? '✓ Accepted' : '✗ Rejected'}`
            : undefined,
          subtitleColor: accepted ? '#10b981' : '#ef4444',
          onPress: openTarantulaProfile(),
        };
      }

      // ── Herpetoverse (ADR-019) ────────────────────────────────────────
      //
      // NO TAP TARGET, deliberately. The public animal profile route
      // `/tarantula/public/[username]/[name]` is invert-only, and there is no
      // public HV animal page on either platform yet. Following the existing
      // convention in this file, a missing destination means no tap rather
      // than a route that 404s — a dead card is better than a broken one, and
      // these land in TV's feed where most viewers keep no reptiles at all.
      //
      // When a public HV animal page exists, wire it here and nowhere else.

      case 'new_animal':
        return {
          actor: displayName,
          verb: 'added',
          tarantulaName: meta.animal_name ?? meta.name,
          speciesName: meta.species_name ?? meta.scientific_name,
          thumbnailUrl: meta.thumbnail_url,
          subtitle: undefined,
          onPress: undefined,
        };

      case 'shed':
        return {
          actor: displayName,
          verb: 'logged a shed for',
          tarantulaName: meta.animal_name,
          speciesName: meta.species_name,
          thumbnailUrl: meta.thumbnail_url,
          // Only claim a complete shed when the log actually says so — a
          // retained shed is a husbandry problem, not a milestone.
          subtitle: meta.is_complete_shed === false ? 'Retained shed' : undefined,
          subtitleColor: meta.is_complete_shed === false ? '#F59E0B' : undefined,
          onPress: undefined,
        };

      case 'weight':
        return {
          actor: displayName,
          verb: 'weighed',
          tarantulaName: meta.animal_name,
          speciesName: meta.species_name,
          thumbnailUrl: meta.thumbnail_url,
          subtitle: meta.weight_g ? `${meta.weight_g} g` : undefined,
          onPress: undefined,
        };

      case 'follow':
        // Tap target: the user who was followed. Mobile keeper profiles
        // live at /community/[username] — there is no /keeper/ route on
        // mobile, so the old `/keeper/` path produced a hard 404.
        // Guard against missing metadata too: if followed_username isn't
        // in the activity_metadata (older activity rows), disable the
        // tap so we don't route to /community/undefined.
        return {
          actor: displayName,
          verb: `followed ${meta.followed_display_name || meta.followed_username || 'someone'}`,
          tarantulaName: undefined,
          speciesName: undefined,
          thumbnailUrl: undefined,
          subtitle: undefined,
          onPress: meta.followed_username
            ? () => router.push(`/community/${meta.followed_username}`)
            : undefined,
        };

      case 'forum_thread':
        // Guard against missing target_id on older activity rows — without
        // this we'd push /forums/thread/null which lands on a hard 404
        // and looks like a broken app, not a missing dataset.
        return {
          actor: displayName,
          verb: 'started a thread',
          tarantulaName: meta.thread_title,
          speciesName: `in ${meta.category_name}`,
          thumbnailUrl: undefined,
          subtitle: undefined,
          onPress: activity.target_id
            ? () => router.push(`/forums/thread/${activity.target_id}`)
            : undefined,
        };

      case 'forum_post':
        // Same null guard — meta.thread_id can be missing on old rows
        // or where the parent thread was deleted. Disable tap rather
        // than route to /forums/thread/undefined.
        return {
          actor: displayName,
          verb: 'replied to',
          tarantulaName: meta.thread_title,
          speciesName: undefined,
          thumbnailUrl: undefined,
          subtitle: undefined,
          onPress: meta.thread_id
            ? () => router.push(`/forums/thread/${meta.thread_id}`)
            : undefined,
        };

      default:
        // Render NOTHING for an activity type this build doesn't know about.
        // This used to ship the literal string "did something" to users — which
        // is what an unknown type looks like when the fallback tries to be
        // friendly instead of silent. A server that starts emitting a new
        // activity_type should be invisible to older clients, not chatty.
        return null;
    }
  };

  const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';

  const icon = getActivityIcon();
  const content = getActivityContent();

  // Unknown activity type — render nothing rather than a placeholder row.
  if (!content) return null;

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={content.onPress}
      disabled={!content.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${content.actor} ${content.verb}${content.tarantulaName ? ` ${content.tarantulaName}` : ''}`}
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
            {/* Was 🕷️. An emoji placeholder is wrong twice over: it renders at
                a different metric box than surrounding text, and it asserts
                "spider" for a feed that carries ten taxa. */}
            <MaterialCommunityIcons name="paw" size={18} color={colors.textTertiary} />
          </View>
        )}

        {/* Text content */}
        <View style={styles.textContent}>
          {/* Actor split out from the verb so it can be bold and tappable.
              These were previously concatenated into one string, which made
              the person who did the thing indistinguishable from the thing. */}
          <Text style={[styles.verb, { color: colors.textSecondary }]} numberOfLines={1}>
            <Text
              style={{ fontWeight: '700', color: colors.textPrimary }}
              onPress={
                activity.username
                  ? () => router.push(`/community/${activity.username}` as never)
                  : undefined
              }
              suppressHighlighting
            >
              {content.actor}
            </Text>
            {' '}{content.verb}
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
