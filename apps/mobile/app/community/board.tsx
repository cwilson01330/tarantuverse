import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, RefreshControl, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Message {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at?: string;
  author_username?: string;
  author_display_name?: string;
  author_avatar_url?: string;
  reply_count: number;
  like_count: number;
  reactions: Record<string, number>;
  user_has_liked: boolean;
  user_reactions: string[];
}

interface Reply {
  id: string;
  message_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_username?: string;
  author_display_name?: string;
  author_avatar_url?: string;
}

const REACTION_EMOJIS = ['❤️', '👍', '😂', '🔥', '🕷️', '🎉'];

export default function BoardScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showNewPostModal, setShowNewPostModal] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});

  useEffect(() => {
    checkAuth();
    fetchMessages();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setCurrentUser({ id: payload.sub, username: payload.username });
      }
    } catch (error) {
      console.error('Failed to decode token');
    }
  };

  const fetchMessages = async () => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      const response = await fetch(`${API_URL}/api/v1/messages`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setMessages(data);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchMessages();
  };

  const handlePostMessage = async () => {
    if (!newPostTitle.trim() || !newPostContent.trim()) return;

    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        router.push('/login');
        return;
      }

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      const response = await fetch(`${API_URL}/api/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newPostTitle,
          content: newPostContent,
        }),
      });

      if (!response.ok) throw new Error('Failed to post');

      setNewPostTitle('');
      setNewPostContent('');
      setShowNewPostModal(false);
      fetchMessages();
    } catch (error) {
      console.error('Failed to post message:', error);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) return;

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      const response = await fetch(`${API_URL}/api/v1/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to delete');
      fetchMessages();
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  const toggleLike = async (messageId: string) => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        router.push('/login');
        return;
      }

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      const response = await fetch(`${API_URL}/api/v1/messages/${messageId}/likes`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to toggle like');
      fetchMessages();
    } catch (error) {
      console.error('Failed to toggle like:', error);
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        router.push('/login');
        return;
      }

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      const response = await fetch(`${API_URL}/api/v1/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ emoji }),
      });

      if (!response.ok) throw new Error('Failed to toggle reaction');
      fetchMessages();
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
    }
  };

  const fetchReplies = async (messageId: string) => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      const response = await fetch(`${API_URL}/api/v1/messages/${messageId}/replies`);
      if (!response.ok) throw new Error('Failed to fetch replies');
      const data = await response.json();
      setReplies(prev => ({ ...prev, [messageId]: data }));
    } catch (error) {
      console.error('Failed to fetch replies:', error);
    }
  };

  const toggleReplies = (messageId: string) => {
    const newExpanded = new Set(expandedReplies);
    if (newExpanded.has(messageId)) {
      newExpanded.delete(messageId);
    } else {
      newExpanded.add(messageId);
      fetchReplies(messageId);
    }
    setExpandedReplies(newExpanded);
  };

  const submitReply = async (messageId: string) => {
    const content = replyContent[messageId];
    if (!content?.trim()) return;

    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        router.push('/login');
        return;
      }

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      const response = await fetch(`${API_URL}/api/v1/messages/${messageId}/replies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) throw new Error('Failed to post reply');

      setReplyContent(prev => ({ ...prev, [messageId]: '' }));
      fetchReplies(messageId);
      fetchMessages();
    } catch (error) {
      console.error('Failed to post reply:', error);
    }
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
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Text style={styles.loadingEmoji}>💬</Text>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading messages...</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Community Board',
          headerBackTitle: 'Community',
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
          {/* New Post Button */}
          {currentUser && (
            <TouchableOpacity
              style={[styles.newPostButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowNewPostModal(true)}
            >
              <MaterialCommunityIcons name="pencil" size={24} color="#fff" />
              <Text style={styles.newPostButtonText}>Post a Message</Text>
            </TouchableOpacity>
          )}

          {!currentUser && (
            <View style={[styles.loginPrompt, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}>
              <Text style={[styles.loginPromptText, { color: colors.textPrimary }]}>Want to join the conversation?</Text>
              <TouchableOpacity
                style={[styles.loginButton, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/login')}
              >
                <Text style={styles.loginButtonText}>Log In</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Messages List */}
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>💬</Text>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No messages yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Be the first to post!</Text>
            </View>
          ) : (
            <View style={styles.messagesList}>
              {messages.map((message) => (
                <View key={message.id} style={[styles.messageCard, { backgroundColor: colors.surface }]}>
                  {/* Message Header */}
                  <View style={styles.messageHeader}>
                    <View style={styles.authorInfo}>
                      <View style={[styles.avatarSmall, { backgroundColor: colors.primary }]}>
                        <Text style={styles.avatarTextSmall}>
                          {message.author_display_name?.[0]?.toUpperCase() || '?'}
                        </Text>
                      </View>
                      <View>
                        <Text style={[styles.authorName, { color: colors.textPrimary }]}>{message.author_display_name || 'Unknown'}</Text>
                        <View style={styles.metaInfo}>
                          <Text style={[styles.metaText, { color: colors.textSecondary }]}>@{message.author_username || 'unknown'}</Text>
                          <Text style={[styles.metaText, { color: colors.textSecondary }]}>•</Text>
                          <Text style={[styles.metaText, { color: colors.textSecondary }]}>{formatDate(message.created_at)}</Text>
                        </View>
                      </View>
                    </View>
                    {currentUser && message.user_id === currentUser.id && (
                      <TouchableOpacity
                        onPress={() => handleDeleteMessage(message.id)}
                        style={styles.deleteButton}
                      >
                        <MaterialCommunityIcons name="delete" size={20} color={colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Message Content */}
                  <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>{message.title}</Text>
                  <Text style={[styles.messageContent, { color: colors.textPrimary }]}>{message.content}</Text>

                  {/* Interactions */}
                  <View style={[styles.interactions, { borderTopColor: colors.border }]}>
                    <TouchableOpacity
                      style={[styles.interactionButton, { backgroundColor: colors.surfaceElevated }, message.user_has_liked && styles.likedButton]}
                      onPress={() => currentUser ? toggleLike(message.id) : router.push('/login')}
                    >
                      <Text style={styles.interactionEmoji}>{message.user_has_liked ? '❤️' : '🤍'}</Text>
                      <Text style={[styles.interactionCount, { color: colors.textSecondary }, message.user_has_liked && { color: colors.error }]}>
                        {message.like_count}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.interactionButton, { backgroundColor: colors.surfaceElevated }]}
                      onPress={() => toggleReplies(message.id)}
                    >
                      <Text style={styles.interactionEmoji}>💬</Text>
                      <Text style={[styles.interactionCount, { color: colors.textSecondary }]}>{message.reply_count}</Text>
                    </TouchableOpacity>

                    {REACTION_EMOJIS.map(emoji => {
                      const count = message.reactions[emoji] || 0;
                      const userReacted = message.user_reactions.includes(emoji);
                      if (count === 0 && !userReacted) return null;
                      return (
                        <TouchableOpacity
                          key={emoji}
                          style={[styles.reactionButton, { backgroundColor: colors.surfaceElevated }, userReacted && { backgroundColor: colors.primaryLight, transform: [{ scale: 1.05 }] }]}
                          onPress={() => currentUser ? toggleReaction(message.id, emoji) : router.push('/login')}
                        >
                          <Text style={styles.reactionEmoji}>{emoji}</Text>
                          {count > 0 && <Text style={[styles.reactionCount, { color: colors.textSecondary }]}>{count}</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Replies Section */}
                  {expandedReplies.has(message.id) && (
                    <View style={[styles.repliesSection, { borderTopColor: colors.border }]}>
                      {/* Reply Input */}
                      {currentUser && (
                        <View style={styles.replyInput}>
                          <TextInput
                            style={[styles.replyTextInput, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.textPrimary }]}
                            placeholder="Write a reply..."
                            placeholderTextColor={colors.textTertiary}
                            value={replyContent[message.id] || ''}
                            onChangeText={(text) =>
                              setReplyContent(prev => ({ ...prev, [message.id]: text }))
                            }
                            multiline
                          />
                          <TouchableOpacity
                            style={[styles.replySubmitButton, { backgroundColor: colors.primary }]}
                            onPress={() => submitReply(message.id)}
                          >
                            <MaterialCommunityIcons name="send" size={20} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Replies List */}
                      {replies[message.id]?.map(reply => (
                        <View key={reply.id} style={[styles.replyCard, { backgroundColor: colors.surfaceElevated }]}>
                          <View style={styles.replyHeader}>
                            <View style={[styles.replyAvatar, { backgroundColor: colors.info }]}>
                              <Text style={styles.replyAvatarText}>
                                {reply.author_display_name?.[0]?.toUpperCase() || '?'}
                              </Text>
                            </View>
                            <View style={styles.replyInfo}>
                              <Text style={[styles.replyAuthor, { color: colors.textPrimary }]}>{reply.author_display_name}</Text>
                              <Text style={[styles.replyMeta, { color: colors.textSecondary }]}>{formatDate(reply.created_at)}</Text>
                            </View>
                          </View>
                          <Text style={[styles.replyContent, { color: colors.textPrimary }]}>{reply.content}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* New Post Modal */}
        <Modal
          visible={showNewPostModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowNewPostModal(false)}
        >
          <KeyboardAvoidingView
            style={[styles.modalContainer, { backgroundColor: colors.surface }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setShowNewPostModal(false)}>
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>New Message</Text>
              <TouchableOpacity onPress={handlePostMessage}>
                <Text style={[styles.modalPostText, { color: colors.primary }]}>Post</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              <View style={styles.modalInputGroup}>
                <Text style={[styles.modalLabel, { color: colors.textPrimary }]}>Title</Text>
                <TextInput
                  style={[styles.modalTitleInput, { borderColor: colors.border, backgroundColor: colors.surfaceElevated, color: colors.textPrimary }]}
                  placeholder="What's on your mind?"
                  placeholderTextColor={colors.textTertiary}
                  value={newPostTitle}
                  onChangeText={setNewPostTitle}
                  maxLength={200}
                />
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={[styles.modalLabel, { color: colors.textPrimary }]}>Message</Text>
                <TextInput
                  style={[styles.modalContentInput, { borderColor: colors.border, backgroundColor: colors.surfaceElevated, color: colors.textPrimary }]}
                  placeholder="Share your thoughts..."
                  placeholderTextColor={colors.textTertiary}
                  value={newPostContent}
                  onChangeText={setNewPostContent}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
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
  newPostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  newPostButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  loginPrompt: {
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  loginPromptText: {
    fontSize: 16,
    marginBottom: 12,
  },
  loginButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  messagesList: {
    padding: 16,
    gap: 12,
  },
  messageCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarSmall: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTextSmall: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  authorName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  metaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
  },
  deleteButton: {
    padding: 8,
  },
  messageTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  messageContent: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  interactions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    flexWrap: 'wrap',
  },
  interactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  likedButton: {
    backgroundColor: '#fee2e2',
  },
  interactionEmoji: {
    fontSize: 16,
  },
  interactionCount: {
    fontSize: 14,
    fontWeight: '700',
  },
  reactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 11,
    fontWeight: '700',
  },
  repliesSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  replyInput: {
    flexDirection: 'row',
    gap: 8,
  },
  replyTextInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  replySubmitButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyCard: {
    borderRadius: 12,
    padding: 12,
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  replyAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  replyInfo: {
    flex: 1,
  },
  replyAuthor: {
    fontSize: 14,
    fontWeight: '600',
  },
  replyMeta: {
    fontSize: 12,
  },
  replyContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
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
  },
  loadingEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  modalCancelText: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalPostText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalInputGroup: {
    marginBottom: 24,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  modalTitleInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  modalContentInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 200,
  },
});
