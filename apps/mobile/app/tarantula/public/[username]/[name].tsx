import { useState, useEffect } from 'react'
import { ScrollView, View, Text, Image, TouchableOpacity, Share, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTheme } from '../../../../src/contexts/ThemeContext'

interface TarantulaPublicProfile {
  tarantula: {
    id: string
    name?: string
    common_name?: string
    scientific_name?: string
    sex?: string
    date_acquired?: string
    photo_url?: string
    notes?: string
  }
  owner: {
    username: string
    display_name?: string
    avatar_url?: string
  }
  species?: {
    id: string
    scientific_name: string
    common_names?: string[]
    care_level?: string
    type?: string
    native_region?: string
    adult_size?: string
    image_url?: string
  }
  feeding_summary: {
    total_feedings: number
    acceptance_rate: number
    last_fed_date?: string
  }
  molt_timeline: Array<{
    id: string
    molted_at: string
    leg_span_before?: number
    leg_span_after?: number
    weight_before?: number
    weight_after?: number
    notes?: string
  }>
  photos: Array<{
    id: string
    url: string
    thumbnail_url?: string
    caption?: string
    taken_at?: string
  }>
}

export default function PublicTarantulaProfile() {
  const params = useLocalSearchParams()
  const router = useRouter()
  const { colors: theme } = useTheme()
  const username = params.username as string
  const name = params.name as string

  const [profile, setProfile] = useState<TarantulaPublicProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000'
        const response = await fetch(
          `${API_URL}/api/v1/tarantulas/public/${username}/${name}`
        )

        if (!response.ok) {
          if (response.status === 404) {
            setError('Tarantula profile not found or is not public')
          } else {
            setError('Failed to load tarantula profile')
          }
          return
        }

        const data = await response.json()
        setProfile(data)
      } catch (err) {
        setError('Error loading tarantula profile')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [username, name])

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Not recorded'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const handleShare = async () => {
    try {
      const url = `https://tarantuverse.com/keeper/${username}/${name}`
      await Share.share({
        message: `Check out ${profile?.tarantula.name || profile?.tarantula.common_name} on Tarantuverse!`,
        url: url,
        title: `${profile?.tarantula.name} - ${profile?.tarantula.common_name}`
      })
    } catch (err) {
      console.error('Share failed:', err)
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  if (error || !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 48, marginBottom: 20 }}>🕷️</Text>
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 10, textAlign: 'center' }}>
          Profile Not Found
        </Text>
        <Text style={{ color: theme.textSecondary, marginBottom: 30, textAlign: 'center' }}>
          {error || 'The tarantula profile you are looking for does not exist or is not public.'}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: theme.primary, borderRadius: 8 }}
        >
          <Text style={{ color: 'white', fontWeight: 'bold' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const t = profile.tarantula
  const lastFedDate = profile.feeding_summary.last_fed_date
    ? new Date(profile.feeding_summary.last_fed_date)
    : null
  const daysSinceFed = lastFedDate
    ? Math.floor(
        (Date.now() - lastFedDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    : null

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: theme.primary, fontSize: 18, fontWeight: 'bold' }}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleShare}
          style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.primary, borderRadius: 6 }}
        >
          <Text style={{ color: 'white', fontWeight: 'bold' }}>📤 Share</Text>
        </TouchableOpacity>
      </View>

      {/* Main Photo */}
      {t.photo_url && (
        <Image
          source={{ uri: t.photo_url }}
          style={{ width: '100%', height: 300 }}
          resizeMode="cover"
        />
      )}

      {/* Tarantula Info Card */}
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 4 }}>
          {t.name}
        </Text>
        {t.common_name && (
          <Text style={{ fontSize: 16, color: theme.textSecondary, marginBottom: 16 }}>
            {t.common_name}
          </Text>
        )}

        {/* Quick Info */}
        <View style={{ marginBottom: 16 }}>
          {t.sex && (
            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '600' }}>Sex</Text>
              <Text style={{ fontSize: 16, color: theme.textPrimary, fontWeight: 'bold', textTransform: 'capitalize' }}>
                {t.sex}
              </Text>
            </View>
          )}
          {t.date_acquired && (
            <View>
              <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '600' }}>Acquired</Text>
              <Text style={{ fontSize: 16, color: theme.textPrimary, fontWeight: 'bold' }}>
                {formatDate(t.date_acquired)}
              </Text>
            </View>
          )}
        </View>

        {/* Owner Info */}
        <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 16 }}>
          <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '600', marginBottom: 8 }}>
            Keeper
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {profile.owner.avatar_url && (
              <Image
                source={{ uri: profile.owner.avatar_url }}
                style={{ width: 40, height: 40, borderRadius: 20 }}
              />
            )}
            <View>
              <Text style={{ fontSize: 14, fontWeight: 'bold', color: theme.textPrimary }}>
                {profile.owner.display_name || profile.owner.username}
              </Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                @{profile.owner.username}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Species Info */}
      {profile.species && (
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 12 }}>
            Species Information
          </Text>
          <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
            {profile.species.care_level && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '600' }}>
                  Care Level
                </Text>
                <Text style={{ fontSize: 14, color: theme.textPrimary, textTransform: 'capitalize' }}>
                  {profile.species.care_level}
                </Text>
              </View>
            )}
            {profile.species.type && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '600' }}>
                  Type
                </Text>
                <Text style={{ fontSize: 14, color: theme.textPrimary, textTransform: 'capitalize' }}>
                  {profile.species.type}
                </Text>
              </View>
            )}
            {profile.species.native_region && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '600' }}>
                  Native Region
                </Text>
                <Text style={{ fontSize: 14, color: theme.textPrimary }}>
                  {profile.species.native_region}
                </Text>
              </View>
            )}
            {profile.species.adult_size && (
              <View>
                <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '600' }}>
                  Adult Size
                </Text>
                <Text style={{ fontSize: 14, color: theme.textPrimary }}>
                  {profile.species.adult_size}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Feeding Summary */}
      <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 12 }}>
          Feeding Summary
        </Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 12, padding: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>
              Total Feedings
            </Text>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.primary }}>
              {profile.feeding_summary.total_feedings}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 12, padding: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>
              Acceptance Rate
            </Text>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.primary }}>
              {profile.feeding_summary.acceptance_rate.toFixed(0)}%
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 12, padding: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>
              Last Fed
            </Text>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: theme.primary, textAlign: 'center' }}>
              {daysSinceFed !== null
                ? daysSinceFed === 0
                  ? 'Today'
                  : daysSinceFed === 1
                    ? 'Yesterday'
                    : `${daysSinceFed}d ago`
                : 'Never'}
            </Text>
          </View>
        </View>
      </View>

      {/* Molt Timeline */}
      {profile.molt_timeline.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 12 }}>
            Molt Timeline
          </Text>
          {profile.molt_timeline.map((molt, index) => (
            <View key={molt.id} style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 4 }}>
                Molt #{profile.molt_timeline.length - index}
              </Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 12 }}>
                {formatDate(molt.molted_at)}
              </Text>
              {(molt.leg_span_before !== undefined && molt.leg_span_after !== undefined) && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: theme.textSecondary }}>Leg Span</Text>
                  <Text style={{ fontSize: 14, color: theme.textPrimary, fontWeight: '600' }}>
                    {molt.leg_span_before}" → {molt.leg_span_after}"
                  </Text>
                </View>
              )}
              {(molt.weight_before !== undefined && molt.weight_after !== undefined) && (
                <View>
                  <Text style={{ fontSize: 12, color: theme.textSecondary }}>Weight</Text>
                  <Text style={{ fontSize: 14, color: theme.textPrimary, fontWeight: '600' }}>
                    {molt.weight_before}g → {molt.weight_after}g
                  </Text>
                </View>
              )}
              {molt.notes && (
                <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 8 }}>
                  {molt.notes}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Photo Gallery */}
      {profile.photos.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 12 }}>
            Photo Gallery ({profile.photos.length})
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {profile.photos.map((photo) => (
              <Image
                key={photo.id}
                source={{ uri: photo.thumbnail_url || photo.url }}
                style={{ width: '32%', aspectRatio: 1, borderRadius: 8 }}
                resizeMode="cover"
              />
            ))}
          </View>
        </View>
      )}

      {/* Notes */}
      {t.notes && (
        <View style={{ paddingHorizontal: 16, marginBottom: 32 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 12 }}>
            Notes
          </Text>
          <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
            <Text style={{ fontSize: 14, color: theme.textPrimary, lineHeight: 20 }}>
              {t.notes}
            </Text>
          </View>
        </View>
      )}

      {/* CTA Banner */}
      <View style={{ paddingHorizontal: 16, marginBottom: 32 }}>
        <View style={{ backgroundColor: theme.primary, borderRadius: 12, padding: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: 'white', marginBottom: 8, textAlign: 'center' }}>
            Track Your Own Tarantulas
          </Text>
          <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 16, textAlign: 'center' }}>
            Join Tarantuverse and start tracking your entire collection.
          </Text>
          <TouchableOpacity
            style={{ paddingHorizontal: 20, paddingVertical: 12, backgroundColor: 'white', borderRadius: 8 }}
          >
            <Text style={{ color: theme.primary, fontWeight: 'bold', textAlign: 'center' }}>
              Sign Up Free
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )
}
