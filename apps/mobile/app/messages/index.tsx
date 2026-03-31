import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Image, AppState } from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Conversation {
  id: string;
  other_user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url?: string;
  };
  last_message?: {
    content: string;
    created_at: string;
    sender_id: string;
  };
  unread_count: number;
  updated_at: string;
}

export default function MessagesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch conversations on focus (navigating back from a conversation)
  useFocusEffect(
    useCallback(() => {
      fetchConversations();

      // Poll every 15 seconds while screen is focused
      pollingRef.current = setInterval(() => {
        fetchConversations(true);
      }, 15000);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };
    }, [])
  );

  // Pause polling when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    });
    return () => subscription.remove();
  }, []);

  const fetchConversations = async (silent = false) => {
    try {
      if (!silent) setError('');
      const response = await apiClient.get('/messages/direct/conversations');
      setConversations(response.data);
    } catch (err: any) {
      if (!silent) {
        const message = err.response?.data?.detail || err.message || 'Failed to load conversations';
        // 401 is handled by apiClient interceptor (redirects to login)
        if (err.response?.status !== 401) {
          setError(message);
        }
      }
    } finally {
      if (!silent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchConversations();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Messages',
            headerBackTitle: 'Back',
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: { color: colors.textPrimary },
          }}
        />
        <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
          <Text style={styles.loadingEmoji}>💬</Text>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading messages...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Messages',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { color: colors.textPrimary },
        }}
      />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
        >
          {error && (
            <View style={[styles.errorContainer, { backgroundColor: colors.background, borderColor: '#fecaca' }]}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: colors.primary }]}
                onPress={() => { setLoading(true); setError(''); fetchConversations(); }}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {conversations.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>💬</Text>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No messages yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Start a conversation with other keepers!
              </Text>
              <TouchableOpacity
                style={[styles.browseCommunityButton, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/(tabs)/community')}
              >
                <Text style={styles.browseCommunityButtonText}>Browse Community</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.conversationsList}>
              {conversations.map((conv) => (
                <TouchableOpacity
                  key={conv.id}
                  style={[styles.conversationCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => router.push(`/messages/${conv.other_user.username}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.conversationContent}>
                    {conv.other_user.avatar_url ? (
                      <Image
                        source={{ uri: conv.other_user.avatar_url }}
                        style={styles.avatar}
                      />
                    ) : (
                      <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                        <Text style={styles.avatarEmoji}>🕷️</Text>
                      </View>
                    )}

                    <View style={styles.conversationInfo}>
                      <View style={styles.conversationHeader}>
                        <Text style={[styles.displayName, { color: colors.textPrimary }]}>
                          {conv.other_user.display_name}
                        </Text>
                        {conv.last_message && (
                          <Text style={[styles.timestamp, { color: colors.textTertiary }]}>
                            {formatDate(conv.updated_at)}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.username, { color: colors.textTertiary }]}>
                        @{conv.other_user.username}
                      </Text>
                      {conv.last_message && (
                        <Text style={[styles.lastMessage, { color: colors.textSecondary }]} numberOfLines={1}>
                          {conv.last_message.content}
                        </Text>
                      )}
                    </View>

                    {conv.unread_count > 0 && (
                      <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.unreadText}>{conv.unread_count}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  errorContainer: {
    padding: 16,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    flex: 1,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 12,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  browseCommunityButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  browseCommunityButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  conversationsList: {
    padding: 16,
  },
  conversationCard: {
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  conversationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 28,
  },
  conversationInfo: {
    flex: 1,
    marginLeft: 12,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  displayName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  timestamp: {
    fontSize: 12,
  },
  username: {
    fontSize: 12,
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 14,
  },
  unreadBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  unreadText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
