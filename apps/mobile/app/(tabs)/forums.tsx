import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

interface ForumCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  thread_count: number;
  post_count: number;
}

export default function ForumsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/v1/forums/categories`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error('Failed to fetch categories');
      }

      const data = await response.json();
      setCategories(data);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchCategories();
  };

  const getCategoryIcon = (icon: string) => {
    const iconMap: { [key: string]: string } = {
      '🕷️': 'spider',
      '💬': 'forum',
      '🔬': 'flask',
      '🏠': 'home',
      '📸': 'camera',
      '💡': 'lightbulb',
      '❓': 'help-circle',
      '📢': 'bullhorn',
    };
    return iconMap[icon] || 'forum';
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading forums...
          </Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="alert-circle" size={64} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={fetchCategories}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Guidelines Box */}
        <View style={[styles.guidelinesBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={styles.guidelinesHeader}>
            <MaterialCommunityIcons name="information" size={20} color={colors.primary} />
            <Text style={[styles.guidelinesTitle, { color: colors.textPrimary }]}>
              Forum Guidelines
            </Text>
          </View>
          <Text style={[styles.guidelinesText, { color: colors.textSecondary }]}>
            Be respectful, share knowledge, and help fellow keepers. Search before posting duplicate questions.
          </Text>
        </View>

        {/* Categories List */}
        {categories.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="forum-outline" size={64} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No forum categories yet
            </Text>
          </View>
        ) : (
          categories.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={[styles.categoryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push(`/forums/${category.slug}`)}
            >
              <View style={styles.categoryHeader}>
                <View style={[styles.categoryIconContainer, { backgroundColor: colors.surfaceElevated }]}>
                  <Text style={styles.categoryEmoji}>{category.icon}</Text>
                </View>
                <View style={styles.categoryInfo}>
                  <Text style={[styles.categoryName, { color: colors.textPrimary }]}>
                    {category.name}
                  </Text>
                  <Text style={[styles.categoryDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                    {category.description}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} />
              </View>

              <View style={[styles.categoryStats, { borderTopColor: colors.border }]}>
                <View style={styles.stat}>
                  <MaterialCommunityIcons name="message-text" size={16} color={colors.primary} />
                  <Text style={[styles.statText, { color: colors.textSecondary }]}>
                    {category.thread_count} {category.thread_count === 1 ? 'thread' : 'threads'}
                  </Text>
                </View>
                <View style={styles.stat}>
                  <MaterialCommunityIcons name="comment-multiple" size={16} color={colors.primary} />
                  <Text style={[styles.statText, { color: colors.textSecondary }]}>
                    {category.post_count} {category.post_count === 1 ? 'post' : 'posts'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    marginTop: 12,
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  guidelinesBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  guidelinesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  guidelinesTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  guidelinesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
  categoryCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  categoryIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryEmoji: {
    fontSize: 24,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  categoryStats: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  statText: {
    fontSize: 13,
    marginLeft: 6,
  },
});
