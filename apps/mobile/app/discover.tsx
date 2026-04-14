import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, FlatList, Image, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme } from '../src/contexts/ThemeContext'
import { useAuth } from '../src/contexts/AuthContext'
import { AppHeader } from '../src/components/AppHeader'

interface DiscoverResponse {
  stats: {
    total_keepers: number
    total_tarantulas: number
    total_species: number
    total_forum_threads: number
  }
  trending_threads: Array<{
    id: number
    title: string
    category: string
    reply_count: number
    author_username: string
    created_at: string
  }>
  active_keepers: Array<{
    id: string
    username: string
    display_name?: string
    avatar_url?: string
    activity_count: number
  }>
  popular_species: Array<{
    id: string
    scientific_name: string
    common_names?: string[]
    image_url?: string
    times_kept: number
    care_level?: string
  }>
  recent_activity: Array<{
    id: number
    user_username: string
    activity_type: string
    data?: any
    created_at: string
  }>
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function getActivityEmoji(actionType: string): string {
  switch (actionType) {
    case 'new_tarantula':
      return '🕷️'
    case 'feeding':
      return '🍗'
    case 'molt':
      return '🔄'
    case 'forum_thread':
      return '💬'
    case 'forum_post':
      return '💭'
    case 'follow':
      return '👥'
    default:
      return '📝'
  }
}

function getActivityLabel(actionType: string): string {
  switch (actionType) {
    case 'new_tarantula':
      return 'added a tarantula'
    case 'feeding':
      return 'logged a feeding'
    case 'molt':
      return 'logged a molt'
    case 'forum_thread':
      return 'started a discussion'
    case 'forum_post':
      return 'replied in a discussion'
    case 'follow':
      return 'followed someone'
    default:
      return 'did something'
  }
}

export default function DiscoverScreen() {
  const router = useRouter()
  const { colors, layout } = useTheme()
  const { token } = useAuth()
  const [discover, setDiscover] = useState<DiscoverResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchDiscoverFeed()
  }, [])

  const fetchDiscoverFeed = async () => {
    try {
      setLoading(true)
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000'

      const response = await fetch(`${API_URL}/api/v1/discover/`)

      if (!response.ok) {
        throw new Error('Failed to fetch discover feed')
      }

      const data = await response.json()
      setDiscover(data)
      setError('')
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchDiscoverFeed()
    setRefreshing(false)
  }

  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary

  const backButton = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  )

  if (loading && !discover) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AppHeader title="✨ Discover" subtitle="Explore trending content and active community members" leftAction={backButton} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="✨ Discover" subtitle="Explore trending content and active community members" leftAction={backButton} />
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >

      {error && (
        <View style={{ marginHorizontal: 16, marginBottom: 16, padding: 12, backgroundColor: '#fee2e2', borderRadius: 8 }}>
          <Text style={{ color: '#991b1b', fontSize: 14 }}>{error}</Text>
        </View>
      )}

      {discover && (
        <>
          {/* Platform Stats */}
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(168, 85, 247, 0.1)',
                  borderRadius: 12,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.primary, marginBottom: 4 }}>
                  {discover.stats.total_keepers}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>Active Keepers</Text>
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  borderRadius: 12,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.primary, marginBottom: 4 }}>
                  {discover.stats.total_tarantulas}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>Tarantulas</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  borderRadius: 12,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.primary, marginBottom: 4 }}>
                  {discover.stats.total_species}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>Species</Text>
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(249, 115, 22, 0.1)',
                  borderRadius: 12,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.primary, marginBottom: 4 }}>
                  {discover.stats.total_forum_threads}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>Discussions</Text>
              </View>
            </View>
          </View>

          {/* Trending Discussions */}
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 12 }}>
              🔥 Trending Discussions
            </Text>
            {discover.trending_threads.length > 0 ? (
              discover.trending_threads.map((thread) => (
                <TouchableOpacity
                  key={thread.id}
                  onPress={() => router.push(`/community/forums/thread/${thread.id}`)}
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: colors.textPrimary,
                      marginBottom: 8,
                    }}
                    numberOfLines={2}
                  >
                    {thread.title}
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          backgroundColor: colors.background,
                          color: colors.textSecondary,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 4,
                        }}
                      >
                        {thread.category}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>by @{thread.author_username}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.primary }}>
                        {thread.reply_count}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.textSecondary }}>replies</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={{ textAlign: 'center', color: colors.textSecondary, paddingVertical: 16 }}>
                No trending discussions yet
              </Text>
            )}
          </View>

          {/* Active Keepers */}
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 12 }}>
              👥 Active Keepers
            </Text>
            {discover.active_keepers.length > 0 ? (
              <FlatList
                scrollEnabled={false}
                data={discover.active_keepers}
                keyExtractor={(item) => item.id}
                numColumns={3}
                columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 12 }}
                renderItem={({ item: keeper }) => (
                  <TouchableOpacity
                    onPress={() => router.push(`/community/${keeper.username}`)}
                    style={{
                      width: '31%',
                      backgroundColor: colors.surface,
                      borderRadius: 12,
                      padding: 12,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: colors.primary,
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      {keeper.avatar_url ? (
                        <Image
                          source={{ uri: keeper.avatar_url }}
                          style={{ width: 48, height: 48, borderRadius: 24 }}
                        />
                      ) : (
                        <Text style={{ fontSize: 24 }}>🕷️</Text>
                      )}
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: colors.textPrimary,
                        textAlign: 'center',
                      }}
                      numberOfLines={1}
                    >
                      {keeper.display_name || keeper.username}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
                      @{keeper.username}
                    </Text>
                    <View style={{ marginTop: 6, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: 'bold', color: colors.primary }}>
                        {keeper.activity_count}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.textSecondary }}>activities</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <Text style={{ textAlign: 'center', color: colors.textSecondary, paddingVertical: 16 }}>
                No active keepers yet
              </Text>
            )}
          </View>

          {/* Popular Species */}
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 12 }}>
              ⭐ Popular Species
            </Text>
            {discover.popular_species.length > 0 ? (
              <FlatList
                scrollEnabled={false}
                data={discover.popular_species}
                keyExtractor={(item) => item.id}
                numColumns={3}
                columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 12 }}
                renderItem={({ item: species }) => (
                  <TouchableOpacity
                    onPress={() => router.push(`/species/${species.id}`)}
                    style={{
                      width: '31%',
                      backgroundColor: colors.surface,
                      borderRadius: 12,
                      overflow: 'hidden',
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <View
                      style={{
                        width: '100%',
                        aspectRatio: 1,
                        backgroundColor: 'rgba(168, 85, 247, 0.1)',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      {species.image_url ? (
                        <Image
                          source={{ uri: species.image_url }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      ) : (
                        <Text style={{ fontSize: 32 }}>🕷️</Text>
                      )}
                    </View>
                    <View style={{ padding: 8 }}>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: colors.textPrimary,
                        }}
                        numberOfLines={2}
                      >
                        {species.scientific_name}
                      </Text>
                      {species.common_names && species.common_names.length > 0 && (
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.textSecondary,
                            marginTop: 4,
                          }}
                          numberOfLines={1}
                        >
                          {species.common_names[0]}
                        </Text>
                      )}
                      <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
                        {species.care_level && (
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: '600',
                              backgroundColor: colors.primary + '20',
                              color: colors.primary,
                              paddingHorizontal: 4,
                              paddingVertical: 2,
                              borderRadius: 3,
                            }}
                          >
                            {species.care_level.charAt(0).toUpperCase() + species.care_level.slice(1)}
                          </Text>
                        )}
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: '600',
                            backgroundColor: colors.background,
                            color: colors.textSecondary,
                            paddingHorizontal: 4,
                            paddingVertical: 2,
                            borderRadius: 3,
                          }}
                        >
                          {species.times_kept}x
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <Text style={{ textAlign: 'center', color: colors.textSecondary, paddingVertical: 16 }}>
                No popular species yet
              </Text>
            )}
          </View>

          {/* Recent Activity */}
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 12 }}>
              📊 Recent Activity
            </Text>
            {discover.recent_activity.length > 0 ? (
              discover.recent_activity.map((activity) => (
                <TouchableOpacity
                  key={activity.id}
                  onPress={() => router.push(`/community/${activity.user_username}`)}
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{getActivityEmoji(activity.activity_type)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: colors.textPrimary }}>
                      <Text style={{ fontWeight: '600' }}>@{activity.user_username}</Text>
                      <Text style={{ color: colors.textSecondary }}>
                        {' '}
                        {getActivityLabel(activity.activity_type)}
                      </Text>
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                      {formatDate(activity.created_at)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={{ textAlign: 'center', color: colors.textSecondary, paddingVertical: 16 }}>
                No recent activity yet
              </Text>
            )}
          </View>
        </>
      )}
      </ScrollView>
    </View>
  )
}
