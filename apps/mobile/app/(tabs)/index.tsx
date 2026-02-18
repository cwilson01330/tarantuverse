import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CopilotProvider, CopilotStep, walkthroughable, useCopilot } from 'react-native-copilot';
import { apiClient } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import TourTooltip from '../../src/components/TourTooltip';
import AnnouncementBanner from '../../src/components/AnnouncementBanner';

const WalkthroughableView = walkthroughable(View);

const TOUR_KEY = 'dashboard_tour_completed';

interface Tarantula {
  id: string;
  name: string;
  common_name: string;
  scientific_name: string;
  sex?: string;
  photo_url?: string;
}

interface FeedingStatus {
  tarantula_id: string;
  days_since_last_feeding?: number;
  acceptance_rate: number;
}

interface PremoltPrediction {
  tarantula_id: string;
  probability: number;
  confidence_level: string;
  status_text: string;
}

interface Enclosure {
  id: string;
  name: string;
  is_communal: boolean;
  population_count: number | null;
  inhabitant_count: number;
  days_since_last_feeding: number | null;
  photo_url: string | null;
  species_name: string | null;
  enclosure_type: string | null;
}

export default function DashboardHubWrapper() {
  const { colors } = useTheme();
  return (
    <CopilotProvider
      tooltipComponent={TourTooltip}
      stepNumberComponent={() => null}
      overlay="svg"
      animated
      backdropColor="rgba(0, 0, 0, 0.6)"
      verticalOffset={0}
      tooltipStyle={{
        borderRadius: 16,
        backgroundColor: 'transparent',
      }}
    >
      <DashboardHubScreen />
    </CopilotProvider>
  );
}

function DashboardHubScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { start: startTour } = useCopilot();
  const [tarantulas, setTarantulas] = useState<Tarantula[]>([]);
  const [feedingStatuses, setFeedingStatuses] = useState<Map<string, FeedingStatus>>(new Map());
  const [premoltPredictions, setPremoltPredictions] = useState<Map<string, PremoltPrediction>>(new Map());
  const [enclosures, setEnclosures] = useState<Enclosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tourChecked, setTourChecked] = useState(false);

  const getImageUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `https://tarantuverse-api.onrender.com${url}`;
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Start tour on first visit (after data loads)
  useEffect(() => {
    if (loading || tourChecked) return;
    const checkTour = async () => {
      try {
        const completed = await AsyncStorage.getItem(TOUR_KEY);
        if (!completed && tarantulas.length > 0) {
          // Mark as completed before starting (covers both skip and finish)
          await AsyncStorage.setItem(TOUR_KEY, 'true');
          setTimeout(() => {
            startTour();
          }, 800);
        }
      } catch {
        // skip
      }
      setTourChecked(true);
    };
    checkTour();
  }, [loading, tourChecked, tarantulas.length]);

  const fetchDashboardData = async () => {
    try {
      const [tarantulasRes, enclosuresRes] = await Promise.all([
        apiClient.get('/tarantulas/').catch(() => null),
        apiClient.get('/enclosures/').catch(() => null),
      ]);

      if (tarantulasRes?.data) {
        setTarantulas(tarantulasRes.data);
        fetchAllFeedingStatuses(tarantulasRes.data);
        fetchAllPremoltPredictions(tarantulasRes.data);
      }

      if (enclosuresRes?.data) {
        setEnclosures(enclosuresRes.data);
      }
    } catch {
      // Dashboard data fetch failed
    } finally {
      setLoading(false);
    }
  };

  const fetchAllFeedingStatuses = async (tarantulasList: Tarantula[]) => {
    const statusMap = new Map<string, FeedingStatus>();
    await Promise.all(
      tarantulasList.map(async (t) => {
        try {
          const response = await apiClient.get(`/tarantulas/${t.id}/feeding-stats`);
          statusMap.set(t.id, {
            tarantula_id: t.id,
            days_since_last_feeding: response.data.days_since_last_feeding,
            acceptance_rate: response.data.acceptance_rate,
          });
        } catch {
          // skip
        }
      })
    );
    setFeedingStatuses(statusMap);
  };

  const fetchAllPremoltPredictions = async (tarantulasList: Tarantula[]) => {
    const predictionMap = new Map<string, PremoltPrediction>();
    await Promise.all(
      tarantulasList.map(async (t) => {
        try {
          const response = await apiClient.get(`/tarantulas/${t.id}/premolt-prediction`);
          predictionMap.set(t.id, {
            tarantula_id: t.id,
            probability: response.data.probability,
            confidence_level: response.data.confidence_level,
            status_text: response.data.status_text,
          });
        } catch {
          // skip
        }
      })
    );
    setPremoltPredictions(predictionMap);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  }, []);

  // Computed stats
  const overdueFeedings = tarantulas.filter(t => {
    const status = feedingStatuses.get(t.id);
    return status && status.days_since_last_feeding !== undefined && status.days_since_last_feeding >= 7;
  }).sort((a, b) => {
    const daysA = feedingStatuses.get(a.id)?.days_since_last_feeding ?? 0;
    const daysB = feedingStatuses.get(b.id)?.days_since_last_feeding ?? 0;
    return daysB - daysA;
  });

  const premoltAlerts = tarantulas.filter(t => {
    const prediction = premoltPredictions.get(t.id);
    return prediction && prediction.confidence_level !== 'low';
  });

  const communalEnclosures = enclosures.filter(e => e.is_communal);

  const getFeedingDaysColor = (days: number) => {
    if (days >= 21) return '#ef4444';
    if (days >= 14) return '#f97316';
    return '#eab308';
  };

  const getPremoltBadgeColor = (confidence: string) => {
    if (confidence === 'very_high') return '#ef4444';
    if (confidence === 'high') return '#f97316';
    return '#eab308';
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 32,
    },
    // Loading skeleton
    skeletonRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 16,
    },
    skeletonCard: {
      flex: 1,
      minWidth: '45%',
      height: 90,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    skeletonSection: {
      height: 200,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    // Stats row
    statsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 20,
    },
    statCard: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 3,
    },
    statCardAlert: {
      borderColor: '#fca5a5',
    },
    statCardPremolt: {
      borderColor: '#c4b5fd',
    },
    statIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 4,
    },
    statIconBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    statLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    statValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textPrimary,
      marginLeft: 50,
    },
    statFooter: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 4,
      marginLeft: 50,
    },
    // Section cards
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 3,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    sectionLink: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    // Feeding alert row
    alertRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: colors.background,
      borderRadius: 12,
      marginBottom: 8,
    },
    alertImage: {
      width: 40,
      height: 40,
      borderRadius: 8,
    },
    alertImagePlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    alertInfo: {
      flex: 1,
      marginLeft: 12,
    },
    alertName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    alertDays: {
      fontSize: 13,
      fontWeight: '500',
      marginTop: 2,
    },
    alertButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      overflow: 'hidden',
    },
    alertButtonText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '600',
    },
    // Communal row
    communalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: colors.background,
      borderRadius: 12,
      marginBottom: 8,
    },
    communalIcon: {
      width: 40,
      height: 40,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    communalInfo: {
      flex: 1,
      marginLeft: 12,
    },
    communalName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    communalMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    // Premolt row
    premoltRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: colors.background,
      borderRadius: 12,
      marginBottom: 8,
    },
    premoltInfo: {
      flex: 1,
      marginLeft: 12,
    },
    premoltName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    premoltSpecies: {
      fontSize: 13,
      fontStyle: 'italic',
      color: colors.textSecondary,
      marginTop: 2,
    },
    premoltBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
    },
    premoltBadgeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    // Quick actions grid
    actionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    actionButton: {
      width: '31%',
      aspectRatio: 1,
      backgroundColor: colors.background,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    actionEmoji: {
      fontSize: 24,
    },
    actionLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
      textAlign: 'center',
    },
    // Empty state
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    emptyEmoji: {
      fontSize: 64,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 22,
    },
    emptyButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    emptyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 12,
    },
    emptyButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    emptySecondaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptySecondaryText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    // All fed message
    allFedContainer: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    allFedEmoji: {
      fontSize: 40,
      marginBottom: 8,
    },
    allFedTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    allFedSubtitle: {
      fontSize: 13,
      color: colors.textTertiary,
      marginTop: 4,
    },
    moreText: {
      fontSize: 13,
      color: colors.textTertiary,
      textAlign: 'center',
      marginTop: 4,
    },
  });

  // Loading skeleton
  if (loading) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.skeletonRow}>
            <View style={styles.skeletonCard} />
            <View style={styles.skeletonCard} />
          </View>
          <View style={styles.skeletonRow}>
            <View style={styles.skeletonCard} />
            <View style={styles.skeletonCard} />
          </View>
          <View style={styles.skeletonSection} />
          <View style={styles.skeletonSection} />
        </ScrollView>
      </View>
    );
  }

  // Empty state
  if (tarantulas.length === 0) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <Text style={styles.emptyEmoji}>🕷️</Text>
        <Text style={styles.emptyTitle}>Welcome to Tarantuverse!</Text>
        <Text style={styles.emptyText}>
          Start your journey by adding your first tarantula to the collection.
        </Text>
        <View style={styles.emptyButtons}>
          <TouchableOpacity
            onPress={() => router.push('/tarantula/add')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emptyButton}
            >
              <MaterialCommunityIcons name="plus" size={20} color="#fff" />
              <Text style={styles.emptyButtonText}>Add Tarantula</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.emptySecondaryButton}
            onPress={() => router.push('/species')}
          >
            <Text style={styles.emptySecondaryText}>📖 Species</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Announcement Banner */}
        <AnnouncementBanner />

        {/* Quick Stats Row */}
        <CopilotStep
          text="These cards show your collection at a glance — total count, feeding alerts, molt tracking, and premolt predictions."
          order={1}
          name="Your Dashboard"
        >
        <WalkthroughableView style={styles.statsRow}>
          {/* My Collection */}
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/(tabs)/collection')}
            activeOpacity={0.7}
          >
            <View style={styles.statIconRow}>
              <LinearGradient
                colors={[colors.primary, colors.secondary]}
                style={styles.statIconBox}
              >
                <Text style={{ fontSize: 20 }}>🕷️</Text>
              </LinearGradient>
              <Text style={styles.statLabel}>My Collection</Text>
            </View>
            <Text style={styles.statValue}>{tarantulas.length}</Text>
            <Text style={styles.statFooter}>View all →</Text>
          </TouchableOpacity>

          {/* Needs Feeding */}
          <TouchableOpacity
            style={[
              styles.statCard,
              overdueFeedings.length > 0 && styles.statCardAlert,
            ]}
            onPress={() => router.push('/(tabs)/collection')}
            activeOpacity={0.7}
          >
            <View style={styles.statIconRow}>
              <View style={[
                styles.statIconBox,
                { backgroundColor: overdueFeedings.length > 0 ? '#ef4444' : colors.primary },
              ]}>
                <Text style={{ fontSize: 20 }}>
                  {overdueFeedings.length > 0 ? '⚠️' : '✅'}
                </Text>
              </View>
              <Text style={styles.statLabel}>Needs Feeding</Text>
            </View>
            <Text style={styles.statValue}>{overdueFeedings.length}</Text>
            <Text style={styles.statFooter}>
              {overdueFeedings.length > 0 ? '7+ days overdue' : 'All on schedule'}
            </Text>
          </TouchableOpacity>

          {/* Total Molts */}
          <View style={styles.statCard}>
            <View style={styles.statIconRow}>
              <LinearGradient
                colors={[colors.primary, colors.secondary]}
                style={styles.statIconBox}
              >
                <Text style={{ fontSize: 20 }}>🦋</Text>
              </LinearGradient>
              <Text style={styles.statLabel}>Total Molts</Text>
            </View>
            <Text style={styles.statValue}>
              {Array.from(premoltPredictions.values()).filter(p => p.probability > 0).length || '—'}
            </Text>
            <Text style={styles.statFooter}>Tracked specimens</Text>
          </View>

          {/* Premolt Alerts */}
          <TouchableOpacity
            style={[
              styles.statCard,
              premoltAlerts.length > 0 && styles.statCardPremolt,
            ]}
            onPress={() => router.push('/(tabs)/collection')}
            activeOpacity={0.7}
          >
            <View style={styles.statIconRow}>
              <View style={[
                styles.statIconBox,
                { backgroundColor: premoltAlerts.length > 0 ? '#8b5cf6' : colors.primary },
              ]}>
                <Text style={{ fontSize: 20 }}>🔮</Text>
              </View>
              <Text style={styles.statLabel}>Premolt Alerts</Text>
            </View>
            <Text style={styles.statValue}>{premoltAlerts.length}</Text>
            <Text style={styles.statFooter}>
              {premoltAlerts.length > 0 ? 'Medium+ confidence' : 'No alerts'}
            </Text>
          </TouchableOpacity>
        </WalkthroughableView>
        </CopilotStep>

        {/* Feeding Alerts Section */}
        <CopilotStep
          text="Tarantulas overdue for feeding show up here, sorted by urgency. Tap any row to log a feeding."
          order={2}
          name="Feeding Alerts"
        >
        <WalkthroughableView style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>🍽️ Feeding Alerts</Text>
          {overdueFeedings.length === 0 ? (
            <View style={styles.allFedContainer}>
              <Text style={styles.allFedEmoji}>✅</Text>
              <Text style={styles.allFedTitle}>All tarantulas are fed on schedule!</Text>
              <Text style={styles.allFedSubtitle}>Great job keeping up with feedings.</Text>
            </View>
          ) : (
            <>
              {overdueFeedings.slice(0, 10).map(t => {
                const days = feedingStatuses.get(t.id)?.days_since_last_feeding ?? 0;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.alertRow}
                    onPress={() => router.push(`/tarantula/${t.id}`)}
                    activeOpacity={0.7}
                  >
                    {t.photo_url ? (
                      <Image source={{ uri: getImageUrl(t.photo_url) }} style={styles.alertImage} />
                    ) : (
                      <View style={styles.alertImagePlaceholder}>
                        <MaterialCommunityIcons name="spider" size={20} color={colors.textTertiary} />
                      </View>
                    )}
                    <View style={styles.alertInfo}>
                      <Text style={styles.alertName}>{t.common_name || t.name}</Text>
                      <Text style={[styles.alertDays, { color: getFeedingDaysColor(days) }]}>
                        {days} days since last feeding
                      </Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => router.push(`/tarantula/${t.id}`)}
                    >
                      <LinearGradient
                        colors={[colors.primary, colors.secondary]}
                        style={styles.alertButton}
                      >
                        <Text style={styles.alertButtonText}>Log</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
              {overdueFeedings.length > 10 && (
                <Text style={styles.moreText}>
                  + {overdueFeedings.length - 10} more overdue
                </Text>
              )}
            </>
          )}
        </WalkthroughableView>
        </CopilotStep>

        {/* Communal Setups (conditional) */}
        {communalEnclosures.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>📦 Communal Setups</Text>
              <TouchableOpacity onPress={() => router.push('/enclosure/add')}>
                <Text style={styles.sectionLink}>All Enclosures →</Text>
              </TouchableOpacity>
            </View>
            {communalEnclosures.map(enc => (
              <TouchableOpacity
                key={enc.id}
                style={styles.communalRow}
                onPress={() => router.push(`/enclosure/${enc.id}`)}
                activeOpacity={0.7}
              >
                <View style={[styles.communalIcon, { backgroundColor: colors.primary + '20' }]}>
                  <Text style={{ fontSize: 20 }}>📦</Text>
                </View>
                <View style={styles.communalInfo}>
                  <Text style={styles.communalName}>{enc.name}</Text>
                  <Text style={styles.communalMeta}>
                    👥 {enc.population_count || enc.inhabitant_count} spiders
                    {enc.species_name ? ` · ${enc.species_name}` : ''}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Premolt Watch List (conditional) */}
        {premoltAlerts.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🔮 Premolt Watch List</Text>
            {premoltAlerts.slice(0, 5).map(t => {
              const prediction = premoltPredictions.get(t.id)!;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={styles.premoltRow}
                  onPress={() => router.push(`/tarantula/${t.id}`)}
                  activeOpacity={0.7}
                >
                  {t.photo_url ? (
                    <Image source={{ uri: getImageUrl(t.photo_url) }} style={styles.alertImage} />
                  ) : (
                    <View style={styles.alertImagePlaceholder}>
                      <MaterialCommunityIcons name="spider" size={20} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={styles.premoltInfo}>
                    <Text style={styles.premoltName}>{t.common_name || t.name}</Text>
                    <Text style={styles.premoltSpecies}>{t.scientific_name}</Text>
                  </View>
                  <View style={[
                    styles.premoltBadge,
                    { backgroundColor: getPremoltBadgeColor(prediction.confidence_level) },
                  ]}>
                    <Text style={styles.premoltBadgeText}>🦋 {prediction.probability}%</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Quick Actions Grid */}
        <CopilotStep
          text="Jump to common tasks — add a tarantula, view your collection, check analytics, browse species, and more."
          order={3}
          name="Quick Actions"
        >
        <WalkthroughableView style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {[
              { emoji: '➕', label: 'Add\nTarantula', route: '/tarantula/add' },
              { emoji: '🕷️', label: 'My\nCollection', route: '/(tabs)/collection' },
              { emoji: '📊', label: 'Analytics', route: '/analytics' },
              { emoji: '📖', label: 'Species\nDB', route: '/(tabs)/species' },
              { emoji: '🌐', label: 'Community', route: '/(tabs)/community' },
              { emoji: '💬', label: 'Messages', route: '/messages' },
            ].map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.actionButton}
                onPress={() => router.push(item.route as any)}
                activeOpacity={0.7}
              >
                <Text style={styles.actionEmoji}>{item.emoji}</Text>
                <Text style={styles.actionLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </WalkthroughableView>
        </CopilotStep>
      </ScrollView>
    </View>
  );
}
