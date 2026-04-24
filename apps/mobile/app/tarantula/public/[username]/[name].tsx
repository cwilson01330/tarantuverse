import { useState, useEffect } from 'react'
import { ScrollView, View, Text, Image, TouchableOpacity, Share, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
  // Used so the header respects the iOS status bar / Dynamic Island
  // inset and the bottom scroll edge respects the home indicator.
  // This screen doesn't live under a tab navigator (it's pushed from
  // a keeper profile), so the insets aren't handled automatically.
  const insets = useSafeAreaInsets()
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

  // Calculate age label from date_acquired. We treat this as a local
  // date to avoid the UTC rewind we fixed elsewhere — the value is a
  // pure "YYYY-MM-DD" from the backend.
  let ageLabel: string | null = null
  if (t.date_acquired) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t.date_acquired)
    if (m) {
      const [, y, mo, d] = m
      const acquired = new Date(Number(y), Number(mo) - 1, Number(d))
      const days = Math.floor((Date.now() - acquired.getTime()) / (1000 * 60 * 60 * 24))
      if (days < 30) ageLabel = `${days}d kept`
      else if (days < 365) ageLabel = `${Math.floor(days / 30)}mo kept`
      else {
        const years = (days / 365).toFixed(1).replace('.0', '')
        ageLabel = `${years}y kept`
      }
    }
  }

  // Most recent molt's leg-span, if the keeper logged one.
  const latestMolt = profile.molt_timeline[0]
  const legSpan = latestMolt?.leg_span_after
    ? `${latestMolt.leg_span_after}" leg span`
    : null

  // Type from species catalog (terrestrial / arboreal / fossorial).
  const habitatType = profile.species?.type
    ? profile.species.type.charAt(0).toUpperCase() + profile.species.type.slice(1)
    : null

  const sexPill = t.sex
    ? {
        label: t.sex.charAt(0).toUpperCase() + t.sex.slice(1),
        symbol: t.sex === 'female' ? '♀' : t.sex === 'male' ? '♂' : '?',
        color: t.sex === 'female' ? '#ec4899' : t.sex === 'male' ? '#3b82f6' : '#9ca3af',
      }
    : null

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
    >
      {/* Header — paddingTop uses the measured safe-area inset so the
          Back / Share row clears the iOS status bar and Dynamic Island
          without hardcoding a magic number for each device. */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          backgroundColor: theme.background,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ color: theme.primary, fontSize: 18, fontWeight: 'bold' }}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleShare}
          style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.primary, borderRadius: 6 }}
        >
          <Text style={{ color: 'white', fontWeight: 'bold' }}>📤 Share</Text>
        </TouchableOpacity>
      </View>

      {/* Hero — main photo with name overlaid for better first impression */}
      <View style={{ position: 'relative' }}>
        {t.photo_url ? (
          <Image
            source={{ uri: t.photo_url }}
            style={{ width: '100%', height: 320 }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: '100%',
              height: 240,
              backgroundColor: theme.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 80 }}>🕷️</Text>
          </View>
        )}
        {/* Gradient overlay + title. Pure RN LinearGradient import adds
            weight; a layered semi-transparent View keeps the binary
            smaller and still reads well in dark mode. */}
        {t.photo_url && (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 140,
              backgroundColor: 'rgba(0,0,0,0.55)',
            }}
          />
        )}
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
          <Text
            style={{
              fontSize: 30,
              fontWeight: '800',
              color: t.photo_url ? '#fff' : theme.textPrimary,
              marginBottom: 2,
            }}
          >
            {t.name || t.common_name || 'Tarantula'}
          </Text>
          {t.common_name && t.name !== t.common_name && (
            <Text
              style={{
                fontSize: 15,
                color: t.photo_url ? 'rgba(255,255,255,0.85)' : theme.textSecondary,
              }}
            >
              {t.common_name}
            </Text>
          )}
          {t.scientific_name && (
            <Text
              style={{
                fontSize: 13,
                fontStyle: 'italic',
                color: t.photo_url ? 'rgba(255,255,255,0.7)' : theme.textTertiary,
                marginTop: 2,
              }}
            >
              {t.scientific_name}
            </Text>
          )}
        </View>
      </View>

      {/* Quick Facts — glanceable stats in a single card. Replaces the
          old scattered "Sex / Acquired" rows with everything a visitor
          needs up front: sex, age, habitat type, and latest leg-span. */}
      <View style={{ paddingHorizontal: 16, marginTop: 16, marginBottom: 16 }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          {sexPill && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: sexPill.color + '22',
                borderWidth: 1,
                borderColor: sexPill.color + '55',
              }}
            >
              <Text style={{ fontSize: 16, color: sexPill.color, fontWeight: '800' }}>
                {sexPill.symbol}
              </Text>
              <Text style={{ fontSize: 13, color: sexPill.color, fontWeight: '700' }}>
                {sexPill.label}
              </Text>
            </View>
          )}
          {ageLabel && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ fontSize: 14 }}>📅</Text>
              <Text style={{ fontSize: 13, color: theme.textPrimary, fontWeight: '600' }}>
                {ageLabel}
              </Text>
            </View>
          )}
          {habitatType && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ fontSize: 14 }}>🌿</Text>
              <Text style={{ fontSize: 13, color: theme.textPrimary, fontWeight: '600' }}>
                {habitatType}
              </Text>
            </View>
          )}
          {legSpan && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ fontSize: 14 }}>📏</Text>
              <Text style={{ fontSize: 13, color: theme.textPrimary, fontWeight: '600' }}>
                {legSpan}
              </Text>
            </View>
          )}
          {profile.species?.adult_size && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ fontSize: 14 }}>📐</Text>
              <Text style={{ fontSize: 13, color: theme.textPrimary, fontWeight: '600' }}>
                Adult: {profile.species.adult_size}
              </Text>
            </View>
          )}
        </View>

        {/* Owner info — kept but compacted, since the name/scientific
            moved up into the hero. Also tappable so visitors can jump
            straight to the keeper's profile. */}
        {t.date_acquired && (
          <Text
            style={{
              fontSize: 12,
              color: theme.textTertiary,
              marginTop: 12,
            }}
          >
            Acquired {formatDate(t.date_acquired)}
          </Text>
        )}

        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            marginTop: 16,
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: theme.border,
          }}
          onPress={() => router.push(`/community/${profile.owner.username}` as never)}
          accessibilityRole="link"
          accessibilityLabel={`View ${profile.owner.display_name || profile.owner.username}'s profile`}
        >
          {profile.owner.avatar_url ? (
            <Image
              source={{ uri: profile.owner.avatar_url }}
              style={{ width: 40, height: 40, borderRadius: 20 }}
            />
          ) : (
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: theme.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 18 }}>🕷️</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '600', marginBottom: 2 }}>
              KEEPER
            </Text>
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: theme.textPrimary }}>
              {profile.owner.display_name || profile.owner.username}
            </Text>
          </View>
          <Text style={{ fontSize: 18, color: theme.textSecondary }}>›</Text>
        </TouchableOpacity>
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

      {/* Photo Gallery — two-column layout with larger tiles and
          optional captions. The hero photo is the first photo when
          the owner hasn't designated a different profile photo, so we
          keep the full gallery here (including the hero) rather than
          skipping the first entry. Captions display when present. */}
      {profile.photos.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: 'bold',
              color: theme.textPrimary,
              marginBottom: 12,
            }}
          >
            Photos ({profile.photos.length})
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {profile.photos.map((photo) => (
              <View
                key={photo.id}
                style={{
                  width: '48.5%',
                  backgroundColor: theme.surface,
                  borderRadius: 12,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Image
                  source={{ uri: photo.thumbnail_url || photo.url }}
                  style={{ width: '100%', aspectRatio: 1 }}
                  resizeMode="cover"
                />
                {photo.caption && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.textSecondary,
                      padding: 8,
                      lineHeight: 16,
                    }}
                    numberOfLines={2}
                  >
                    {photo.caption}
                  </Text>
                )}
              </View>
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
