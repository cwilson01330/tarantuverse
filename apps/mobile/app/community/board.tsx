import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, RefreshControl, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
      <View style={styles.centerContainer}>
        <Text style={styles.loadingEmoji}>💬</Text>
        <Text style={styles.loadingText}>Loading messages...</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Community Board',
          headerBackTitle: 'Community',
        }}
      />
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#7c3aed" />
          }
        >
          {/* New Post Button */}
          {currentUser && (
            <TouchableOpacity
              style={styles.newPostButton}
              onPress={() => setShowNewPostModal(true)}
            >
              <MaterialCommunityIcons name="pencil" size={24} color="white" />
              <Text style={styles.newPostButtonText}>Post a Message</Text>
            </TouchableOpacity>
          )}

          {!currentUser && (
            <View style={styles.loginPrompt}>
              <Text style={styles.loginPromptText}>Want to join the conversation?</Text>
              <TouchableOpacity
                style={styles.loginButton}
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
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySubtitle}>Be the first to post!</Text>
            </View>
          ) : (
            <View style={styles.messagesList}>
              {messages.map((message) => (
                <View key={message.id} style={styles.messageCard}>
                  {/* Message Header */}
                  <View style={styles.messageHeader}>
                    <View style={styles.authorInfo}>
                      <View style={styles.avatarSmall}>
                        <Text style={styles.avatarTextSmall}>
                          {message.author_display_name?.[0]?.toUpperCase() || '?'}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.authorName}>{message.author_display_name || 'Unknown'}</Text>
                        <View style={styles.metaInfo}>
                          <Text style={styles.metaText}>@{message.author_username || 'unknown'}</Text>
                          <Text style={styles.metaText}>•</Text>
                          <Text style={styles.metaText}>{formatDate(message.created_at)}</Text>
                        </View>
                      </View>
                    </View>
                    {currentUser && message.user_id === currentUser.id && (
                      <TouchableOpacity
                        onPress={() => handleDeleteMessage(message.id)}
                        style={styles.deleteButton}
                      >
                        <MaterialCommunityIcons name="delete" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Message Content */}
                  <Text style={styles.messageTitle}>{message.title}</Text>
                  <Text style={styles.messageContent}>{message.content}</Text>

                  {/* Interactions */}
                  <View style={styles.interactions}>
                    <TouchableOpacity
                      style={[styles.interactionButton, message.user_has_liked && styles.likedButton]}
                      onPress={() => currentUser ? toggleLike(message.id) : router.push('/login')}
                    >
                      <Text style={styles.interactionEmoji}>{message.user_has_liked ? '❤️' : '🤍'}</Text>
                      <Text style={[styles.interactionCount, message.user_has_liked && styles.likedCount]}>
                        {message.like_count}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.interactionButton}
                      onPress={() => toggleReplies(message.id)}
                    >
                      <Text style={styles.interactionEmoji}>💬</Text>
                      <Text style={styles.interactionCount}>{message.reply_count}</Text>
                    </TouchableOpacity>

                    {REACTION_EMOJIS.map(emoji => {
                      const count = message.reactions[emoji] || 0;
                      const userReacted = message.user_reactions.includes(emoji);
                      if (count === 0 && !userReacted) return null;
                      return (
                        <TouchableOpacity
                          key={emoji}
                          style={[styles.reactionButton, userReacted && styles.reactionButtonActive]}
                          onPress={() => currentUser ? toggleReaction(message.id, emoji) : router.push('/login')}
                        >
                          <Text style={styles.reactionEmoji}>{emoji}</Text>
                          {count > 0 && <Text style={styles.reactionCount}>{count}</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Replies Section */}
                  {expandedReplies.has(message.id) && (
                    <View style={styles.repliesSection}>
                      {/* Reply Input */}
                      {currentUser && (
                        <View style={styles.replyInput}>
                          <TextInput
                            style={styles.replyTextInput}
                            placeholder="Write a reply..."
                            value={replyContent[message.id] || ''}
                            onChangeText={(text) =>
                              setReplyContent(prev => ({ ...prev, [message.id]: text }))
                            }
                            multiline
                          />
                          <TouchableOpacity
                            style={styles.replySubmitButton}
                            onPress={() => submitReply(message.id)}
                          >
                            <MaterialCommunityIcons name="send" size={20} color="white" />
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Replies List */}
                      {replies[message.id]?.map(reply => (
                        <View key={reply.id} style={styles.replyCard}>
                          <View style={styles.replyHeader}>
                            <View style={styles.replyAvatar}>
                              <Text style={styles.replyAvatarText}>
                                {reply.author_display_name?.[0]?.toUpperCase() || '?'}
                              </Text>
                            </View>
                            <View style={styles.replyInfo}>
                              <Text style={styles.replyAuthor}>{reply.author_display_name}</Text>
                              <Text style={styles.replyMeta}>{formatDate(reply.created_at)}</Text>
                            </View>
                          </View>
                          <Text style={styles.replyContent}>{reply.content}</Text>
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
            style={styles.modalContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowNewPostModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>New Message</Text>
              <TouchableOpacity onPress={handlePostMessage}>
                <Text style={styles.modalPostText}>Post</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>Title</Text>
                <TextInput
                  style={styles.modalTitleInput}
                  placeholder="What's on your mind?"
                  value={newPostTitle}
                  onChangeText={setNewPostTitle}
                  maxLength={200}
                />
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>Message</Text>
                <TextInput
                  style={styles.modalContentInput}
                  placeholder="Share your thoughts..."
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
    backgroundColor: '#f8f9fa',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  newPostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7c3aed',
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
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  loginPrompt: {
    backgroundColor: '#f3e8ff',
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  loginPromptText: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 12,
  },
  loginButton: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  loginButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  messagesList: {
    padding: 16,
    gap: 12,
  },
  messageCard: {
    backgroundColor: 'white',
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
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTextSmall: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  authorName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  metaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
    color: '#6b7280',
  },
  deleteButton: {
    padding: 8,
  },
  messageTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  messageContent: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 12,
  },
  interactions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    flexWrap: 'wrap',
  },
  interactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f3f4f6',
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
    color: '#6b7280',
  },
  likedCount: {
    color: '#dc2626',
  },
  reactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
  },
  reactionButtonActive: {
    backgroundColor: '#f3e8ff',
    transform: [{ scale: 1.05 }],
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
  },
  repliesSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    gap: 12,
  },
  replyInput: {
    flexDirection: 'row',
    gap: 8,
  },
  replyTextInput: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  replySubmitButton: {
    backgroundColor: '#7c3aed',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyCard: {
    backgroundColor: '#f9fafb',
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
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyAvatarText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  replyInfo: {
    flex: 1,
  },
  replyAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  replyMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  replyContent: {
    fontSize: 14,
    color: '#374151',
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
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  loadingEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalCancelText: {
    fontSize: 16,
    color: '#6b7280',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  modalPostText: {
    fontSize: 16,
    color: '#7c3aed',
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
    color: '#374151',
    marginBottom: 8,
  },
  modalTitleInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  modalContentInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 200,
  },
});

