import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

interface EnclosureDetail {
  id: string;
  name: string;
  is_communal: boolean;
  species_id: string | null;
  species_name: string | null;
  population_count: number | null;
  enclosure_type: string | null;
  enclosure_size: string | null;
  substrate_type: string | null;
  substrate_depth: string | null;
  target_temp_min: number | null;
  target_temp_max: number | null;
  target_humidity_min: number | null;
  target_humidity_max: number | null;
  water_dish: boolean;
  misting_schedule: string | null;
  notes: string | null;
  photo_url: string | null;
  inhabitant_count: number;
  days_since_last_feeding: number | null;
  created_at: string;
}

interface Inhabitant {
  id: string;
  name: string;
  scientific_name: string;
  photo_url: string | null;
  sex: string | null;
}

interface FeedingLog {
  id: string;
  fed_at: string;
  food_type: string;
  food_size: string | null;
  quantity: number;
  accepted: boolean;
  notes: string | null;
}

interface MoltLog {
  id: string;
  molted_at: string;
  is_unidentified: boolean;
  tarantula_id: string | null;
  notes: string | null;
}

interface SubstrateChange {
  id: string;
  changed_at: string;
  substrate_type: string | null;
  substrate_depth: string | null;
  reason: string | null;
  notes: string | null;
}

type TabType = 'info' | 'inhabitants' | 'feedings' | 'molts' | 'substrate';

export default function EnclosureDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const [enclosure, setEnclosure] = useState<EnclosureDetail | null>(null);
  const [inhabitants, setInhabitants] = useState<Inhabitant[]>([]);
  const [feedingLogs, setFeedingLogs] = useState<FeedingLog[]>([]);
  const [moltLogs, setMoltLogs] = useState<MoltLog[]>([]);
  const [substrateChanges, setSubstrateChanges] = useState<SubstrateChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('info');

  // Quick feeding form state
  const [showFeedingForm, setShowFeedingForm] = useState(false);
  const [feedingFood, setFeedingFood] = useState('');
  const [feedingQuantity, setFeedingQuantity] = useState('');
  const [submittingFeeding, setSubmittingFeeding] = useState(false);

  const getImageUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `https://tarantuverse-api.onrender.com${url}`;
  };

  useEffect(() => {
    fetchAll();
  }, [id]);

  const fetchAll = async () => {
    await Promise.all([
      fetchEnclosure(),
      fetchInhabitants(),
      fetchFeedings(),
      fetchMolts(),
      fetchSubstrateChanges(),
    ]);
  };

  const fetchEnclosure = async () => {
    try {
      const response = await apiClient.get(`/enclosures/${id}`);
      setEnclosure(response.data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load enclosure');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const fetchInhabitants = async () => {
    try {
      const response = await apiClient.get(`/enclosures/${id}/inhabitants`);
      setInhabitants(response.data);
    } catch (error) {
      console.error('Failed to fetch inhabitants:', error);
    }
  };

  const fetchFeedings = async () => {
    try {
      const response = await apiClient.get(`/enclosures/${id}/feedings`);
      setFeedingLogs(response.data.slice(0, 10));
    } catch (error) {
      console.error('Failed to fetch feedings:', error);
    }
  };

  const fetchMolts = async () => {
    try {
      const response = await apiClient.get(`/enclosures/${id}/molts`);
      setMoltLogs(response.data.slice(0, 10));
    } catch (error) {
      console.error('Failed to fetch molts:', error);
    }
  };

  const fetchSubstrateChanges = async () => {
    try {
      const response = await apiClient.get(`/enclosures/${id}/substrate-changes`);
      setSubstrateChanges(response.data.slice(0, 10));
    } catch (error) {
      console.error('Failed to fetch substrate changes:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, []);

  const handleDelete = () => {
    Alert.alert(
      'Delete Enclosure',
      'Are you sure you want to delete this enclosure? This will also delete all associated feeding and molt logs.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/enclosures/${id}`);
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete enclosure');
            }
          },
        },
      ]
    );
  };

  const handleQuickFeeding = async () => {
    if (!feedingFood.trim()) {
      Alert.alert('Error', 'Please enter food type');
      return;
    }

    setSubmittingFeeding(true);
    try {
      await apiClient.post(`/enclosures/${id}/feedings`, {
        fed_at: new Date().toISOString(),
        food_type: feedingFood.trim(),
        quantity: parseInt(feedingQuantity) || 1,
        accepted: true,
      });
      setFeedingFood('');
      setFeedingQuantity('');
      setShowFeedingForm(false);
      fetchFeedings();
      fetchEnclosure();
      Alert.alert('Success', 'Feeding logged successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to log feeding');
    } finally {
      setSubmittingFeeding(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getFeedingStatusColor = (days: number | null) => {
    if (days === null) return colors.textTertiary;
    if (days >= 21) return '#ef4444';
    if (days >= 14) return '#f97316';
    if (days >= 7) return '#eab308';
    return '#22c55e';
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      position: 'relative',
    },
    headerImage: {
      width: '100%',
      height: 200,
    },
    headerPlaceholder: {
      width: '100%',
      height: 200,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 16,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerActions: {
      flexDirection: 'row',
      gap: 8,
    },
    titleContainer: {
      padding: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    name: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textPrimary,
      flex: 1,
    },
    communalBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: 'rgba(147, 51, 234, 0.15)',
    },
    communalBadgeText: {
      color: '#9333ea',
      fontSize: 13,
      fontWeight: '600',
    },
    speciesName: {
      fontSize: 16,
      fontStyle: 'italic',
      color: colors.textSecondary,
      marginTop: 4,
    },
    statsRow: {
      flexDirection: 'row',
      marginTop: 12,
      gap: 16,
    },
    statItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    tabs: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tab: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
    },
    tabActive: {
      borderBottomWidth: 2,
      borderBottomColor: colors.primary,
    },
    tabText: {
      fontSize: 13,
      color: colors.textTertiary,
      fontWeight: '500',
    },
    tabTextActive: {
      color: colors.primary,
    },
    content: {
      flex: 1,
    },
    section: {
      padding: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 12,
    },
    infoGrid: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    infoRowLast: {
      borderBottomWidth: 0,
    },
    infoLabel: {
      fontSize: 14,
      color: colors.textTertiary,
    },
    infoValue: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    inhabitantCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    inhabitantImage: {
      width: 50,
      height: 50,
      borderRadius: 8,
    },
    inhabitantPlaceholder: {
      width: 50,
      height: 50,
      borderRadius: 8,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    inhabitantInfo: {
      flex: 1,
      marginLeft: 12,
    },
    inhabitantName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    inhabitantSpecies: {
      fontSize: 13,
      fontStyle: 'italic',
      color: colors.textTertiary,
    },
    logCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    logHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    logDate: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    logBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
    },
    logBadgeText: {
      fontSize: 12,
      fontWeight: '500',
    },
    logDetails: {
      marginTop: 8,
    },
    logText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textTertiary,
      marginTop: 12,
    },
    quickFeedingCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    quickFeedingTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 12,
    },
    inputRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    input: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    quantityInput: {
      width: 80,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 8,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: colors.border,
    },
    cancelButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    submitButton: {
      flex: 1,
      borderRadius: 8,
      overflow: 'hidden',
    },
    submitButtonGradient: {
      paddingVertical: 10,
      alignItems: 'center',
    },
    submitButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#fff',
    },
    addLogButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
      borderStyle: 'dashed',
    },
    addLogButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    notesCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 16,
    },
    notesText: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
  });

  if (loading || !enclosure) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <MaterialCommunityIcons name="loading" size={40} color={colors.primary} />
      </View>
    );
  }

  const renderInfoTab = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Enclosure Properties</Text>
      <View style={styles.infoGrid}>
        {enclosure.enclosure_type && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type</Text>
            <Text style={styles.infoValue}>{enclosure.enclosure_type}</Text>
          </View>
        )}
        {enclosure.enclosure_size && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Size</Text>
            <Text style={styles.infoValue}>{enclosure.enclosure_size}</Text>
          </View>
        )}
        {enclosure.substrate_type && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Substrate</Text>
            <Text style={styles.infoValue}>{enclosure.substrate_type}</Text>
          </View>
        )}
        {enclosure.substrate_depth && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Substrate Depth</Text>
            <Text style={styles.infoValue}>{enclosure.substrate_depth}</Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Water Dish</Text>
          <Text style={styles.infoValue}>{enclosure.water_dish ? 'Yes' : 'No'}</Text>
        </View>
        {enclosure.misting_schedule && (
          <View style={[styles.infoRow, styles.infoRowLast]}>
            <Text style={styles.infoLabel}>Misting</Text>
            <Text style={styles.infoValue}>{enclosure.misting_schedule}</Text>
          </View>
        )}
      </View>

      {(enclosure.target_temp_min || enclosure.target_humidity_min) && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Climate</Text>
          <View style={styles.infoGrid}>
            {(enclosure.target_temp_min || enclosure.target_temp_max) && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Temperature</Text>
                <Text style={styles.infoValue}>
                  {enclosure.target_temp_min || '?'}°F - {enclosure.target_temp_max || '?'}°F
                </Text>
              </View>
            )}
            {(enclosure.target_humidity_min || enclosure.target_humidity_max) && (
              <View style={[styles.infoRow, styles.infoRowLast]}>
                <Text style={styles.infoLabel}>Humidity</Text>
                <Text style={styles.infoValue}>
                  {enclosure.target_humidity_min || '?'}% - {enclosure.target_humidity_max || '?'}%
                </Text>
              </View>
            )}
          </View>
        </>
      )}

      {enclosure.notes && (
        <View style={styles.notesCard}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.notesText}>{enclosure.notes}</Text>
        </View>
      )}
    </View>
  );

  const renderInhabitantsTab = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        Inhabitants ({enclosure.is_communal ? (enclosure.population_count || inhabitants.length) : inhabitants.length})
      </Text>
      {inhabitants.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="spider" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>
            {enclosure.is_communal && enclosure.population_count
              ? `Population: ${enclosure.population_count} (untracked individuals)`
              : 'No inhabitants assigned'}
          </Text>
        </View>
      ) : (
        inhabitants.map((inhabitant) => (
          <TouchableOpacity
            key={inhabitant.id}
            style={styles.inhabitantCard}
            onPress={() => router.push(`/tarantula/${inhabitant.id}`)}
          >
            {inhabitant.photo_url ? (
              <Image source={{ uri: getImageUrl(inhabitant.photo_url) }} style={styles.inhabitantImage} />
            ) : (
              <View style={styles.inhabitantPlaceholder}>
                <MaterialCommunityIcons name="spider" size={24} color={colors.textTertiary} />
              </View>
            )}
            <View style={styles.inhabitantInfo}>
              <Text style={styles.inhabitantName}>{inhabitant.name}</Text>
              <Text style={styles.inhabitantSpecies}>{inhabitant.scientific_name}</Text>
            </View>
            {inhabitant.sex && (
              <MaterialCommunityIcons
                name={inhabitant.sex === 'female' ? 'gender-female' : 'gender-male'}
                size={20}
                color={inhabitant.sex === 'female' ? '#ec4899' : '#3b82f6'}
              />
            )}
            <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} />
          </TouchableOpacity>
        ))
      )}
    </View>
  );

  const renderFeedingsTab = () => (
    <View style={styles.section}>
      {showFeedingForm ? (
        <View style={styles.quickFeedingCard}>
          <Text style={styles.quickFeedingTitle}>Quick Feeding Log</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Food type (e.g., crickets)"
              placeholderTextColor={colors.textTertiary}
              value={feedingFood}
              onChangeText={setFeedingFood}
            />
            <TextInput
              style={[styles.input, styles.quantityInput]}
              placeholder="Qty"
              placeholderTextColor={colors.textTertiary}
              value={feedingQuantity}
              onChangeText={setFeedingQuantity}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowFeedingForm(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleQuickFeeding}
              disabled={submittingFeeding}
            >
              <LinearGradient
                colors={[colors.primary, colors.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.submitButtonGradient}
              >
                <Text style={styles.submitButtonText}>
                  {submittingFeeding ? 'Saving...' : 'Log Feeding'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.addLogButton} onPress={() => setShowFeedingForm(true)}>
          <MaterialCommunityIcons name="plus" size={20} color={colors.primary} />
          <Text style={styles.addLogButtonText}>Add Feeding</Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Feeding History</Text>
      {feedingLogs.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="food-drumstick" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No feedings logged yet</Text>
        </View>
      ) : (
        feedingLogs.map((log) => (
          <View key={log.id} style={styles.logCard}>
            <View style={styles.logHeader}>
              <Text style={styles.logDate}>{formatDate(log.fed_at)}</Text>
              <View style={[styles.logBadge, { backgroundColor: log.accepted ? '#dcfce7' : '#fee2e2' }]}>
                <Text style={[styles.logBadgeText, { color: log.accepted ? '#22c55e' : '#ef4444' }]}>
                  {log.accepted ? 'Accepted' : 'Refused'}
                </Text>
              </View>
            </View>
            <View style={styles.logDetails}>
              <Text style={styles.logText}>
                {log.quantity > 1 ? `${log.quantity}x ` : ''}{log.food_type}
                {log.food_size ? ` (${log.food_size})` : ''}
              </Text>
              {log.notes && <Text style={[styles.logText, { marginTop: 4 }]}>{log.notes}</Text>}
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderMoltsTab = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Molt History</Text>
      {moltLogs.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="shimmer" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No molts logged yet</Text>
        </View>
      ) : (
        moltLogs.map((log) => (
          <View key={log.id} style={styles.logCard}>
            <View style={styles.logHeader}>
              <Text style={styles.logDate}>{formatDate(log.molted_at)}</Text>
              {log.is_unidentified && (
                <View style={[styles.logBadge, { backgroundColor: '#fef3c7' }]}>
                  <Text style={[styles.logBadgeText, { color: '#d97706' }]}>Unidentified</Text>
                </View>
              )}
            </View>
            {log.notes && (
              <View style={styles.logDetails}>
                <Text style={styles.logText}>{log.notes}</Text>
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );

  const renderSubstrateTab = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Substrate Changes</Text>
      {substrateChanges.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="shovel" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No substrate changes logged yet</Text>
        </View>
      ) : (
        substrateChanges.map((log) => (
          <View key={log.id} style={styles.logCard}>
            <View style={styles.logHeader}>
              <Text style={styles.logDate}>{formatDate(log.changed_at)}</Text>
              {log.reason && (
                <View style={[styles.logBadge, { backgroundColor: colors.border }]}>
                  <Text style={[styles.logBadgeText, { color: colors.textSecondary }]}>{log.reason}</Text>
                </View>
              )}
            </View>
            <View style={styles.logDetails}>
              {log.substrate_type && (
                <Text style={styles.logText}>Type: {log.substrate_type}</Text>
              )}
              {log.substrate_depth && (
                <Text style={styles.logText}>Depth: {log.substrate_depth}</Text>
              )}
              {log.notes && <Text style={[styles.logText, { marginTop: 4 }]}>{log.notes}</Text>}
            </View>
          </View>
        ))
      )}
    </View>
  );

  const population = enclosure.is_communal
    ? (enclosure.population_count || enclosure.inhabitant_count)
    : enclosure.inhabitant_count;

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Header Image */}
        <View style={styles.header}>
          {enclosure.photo_url ? (
            <Image source={{ uri: getImageUrl(enclosure.photo_url) }} style={styles.headerImage} />
          ) : (
            <View style={styles.headerPlaceholder}>
              <MaterialCommunityIcons name="home-variant" size={64} color={colors.textTertiary} />
            </View>
          )}
          <View style={styles.headerOverlay}>
            <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
              <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => router.push(`/enclosure/edit?id=${id}`)}
              >
                <MaterialCommunityIcons name="pencil" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerButton} onPress={handleDelete}>
                <MaterialCommunityIcons name="delete" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Title */}
        <View style={styles.titleContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.name}>{enclosure.name}</Text>
            {enclosure.is_communal && (
              <View style={styles.communalBadge}>
                <Text style={styles.communalBadgeText}>Communal</Text>
              </View>
            )}
          </View>
          {enclosure.species_name && (
            <Text style={styles.speciesName}>{enclosure.species_name}</Text>
          )}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <MaterialCommunityIcons
                name={enclosure.is_communal ? 'account-group' : 'spider'}
                size={18}
                color={colors.textSecondary}
              />
              <Text style={styles.statText}>
                {population} {population === 1 ? 'spider' : 'spiders'}
              </Text>
            </View>
            <View style={styles.statItem}>
              <MaterialCommunityIcons
                name="food-drumstick"
                size={18}
                color={getFeedingStatusColor(enclosure.days_since_last_feeding)}
              />
              <Text style={[styles.statText, { color: getFeedingStatusColor(enclosure.days_since_last_feeding) }]}>
                {enclosure.days_since_last_feeding !== null
                  ? `Fed ${enclosure.days_since_last_feeding}d ago`
                  : 'No feedings'}
              </Text>
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {(['info', 'inhabitants', 'feedings', 'molts', 'substrate'] as TabType[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        <View style={styles.content}>
          {activeTab === 'info' && renderInfoTab()}
          {activeTab === 'inhabitants' && renderInhabitantsTab()}
          {activeTab === 'feedings' && renderFeedingsTab()}
          {activeTab === 'molts' && renderMoltsTab()}
          {activeTab === 'substrate' && renderSubstrateTab()}
        </View>
      </ScrollView>
    </View>
  );
}
