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
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { AppHeader } from '../../src/components/AppHeader';
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

interface Incident {
  id: string;
  incident_type: string;
  severity: string | null;
  occurred_at: string;
  tarantula_id: string | null;
  tarantula_name: string | null;
  description: string | null;
  outcome: string | null;
  created_at: string;
}

const INCIDENT_TYPES = [
  { value: 'aggression', label: 'Aggression', icon: 'alert-circle', color: '#ef4444', bg: '#fee2e2' },
  { value: 'cannibalism_attempt', label: 'Cannibalism', icon: 'skull', color: '#7f1d1d', bg: '#fecaca' },
  { value: 'injury', label: 'Injury', icon: 'bandage', color: '#f97316', bg: '#ffedd5' },
  { value: 'death', label: 'Death', icon: 'cross-circle', color: '#6b7280', bg: '#f3f4f6' },
  { value: 'removal', label: 'Removal', icon: 'exit-run', color: '#6366f1', bg: '#e0e7ff' },
  { value: 'addition', label: 'Addition', icon: 'plus-circle', color: '#22c55e', bg: '#dcfce7' },
  { value: 'escape', label: 'Escape', icon: 'run-fast', color: '#eab308', bg: '#fef9c3' },
  { value: 'molt_found', label: 'Molt Found', icon: 'shimmer', color: '#8b5cf6', bg: '#ede9fe' },
  { value: 'observation', label: 'Observation', icon: 'eye', color: '#0ea5e9', bg: '#e0f2fe' },
];

const SEVERITY_OPTIONS = [
  { value: 'minor', label: 'Minor', color: '#eab308' },
  { value: 'moderate', label: 'Moderate', color: '#f97316' },
  { value: 'severe', label: 'Severe', color: '#ef4444' },
];

const SEVERITY_TYPES = ['aggression', 'cannibalism_attempt', 'injury'];

type TabType = 'info' | 'inhabitants' | 'feedings' | 'molts' | 'substrate' | 'incidents';

export default function EnclosureDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const [enclosure, setEnclosure] = useState<EnclosureDetail | null>(null);
  const [inhabitants, setInhabitants] = useState<Inhabitant[]>([]);
  const [feedingLogs, setFeedingLogs] = useState<FeedingLog[]>([]);
  const [moltLogs, setMoltLogs] = useState<MoltLog[]>([]);
  const [substrateChanges, setSubstrateChanges] = useState<SubstrateChange[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('info');

  // Quick feeding form state
  const [showFeedingForm, setShowFeedingForm] = useState(false);
  const [feedingFood, setFeedingFood] = useState('');
  const [feedingQuantity, setFeedingQuantity] = useState('');
  const [submittingFeeding, setSubmittingFeeding] = useState(false);

  // Incident form state
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentType, setIncidentType] = useState('aggression');
  const [incidentSeverity, setIncidentSeverity] = useState('minor');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentOutcome, setIncidentOutcome] = useState('');
  const [submittingIncident, setSubmittingIncident] = useState(false);

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
      fetchIncidents(),
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

  const fetchIncidents = async () => {
    try {
      const response = await apiClient.get(`/enclosures/${id}/incidents`);
      setIncidents(response.data);
    } catch (error) {
      console.error('Failed to fetch incidents:', error);
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

  const handleLogIncident = async () => {
    setSubmittingIncident(true);
    try {
      await apiClient.post(`/enclosures/${id}/incidents`, {
        incident_type: incidentType,
        severity: SEVERITY_TYPES.includes(incidentType) ? incidentSeverity : null,
        occurred_at: new Date().toISOString().split('T')[0],
        description: incidentDescription.trim() || null,
        outcome: incidentOutcome.trim() || null,
      });
      setIncidentDescription('');
      setIncidentOutcome('');
      setIncidentType('aggression');
      setIncidentSeverity('minor');
      setShowIncidentForm(false);
      fetchIncidents();
      Alert.alert('Logged', 'Incident recorded successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to log incident');
    } finally {
      setSubmittingIncident(false);
    }
  };

  const handleDeleteIncident = (incidentId: string) => {
    Alert.alert('Delete Incident', 'Remove this incident log?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/enclosures/${id}/incidents/${incidentId}`);
            setIncidents(prev => prev.filter(i => i.id !== incidentId));
          } catch {
            Alert.alert('Error', 'Failed to delete incident');
          }
        },
      },
    ]);
  };

  const handleAddInhabitant = () => {
    Alert.alert(
      'Add Inhabitant',
      'How would you like to add a member to this communal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add New Tarantula',
          onPress: () => router.push(`/tarantula/add?enclosure_id=${id}` as any),
        },
      ]
    );
  };

  const handleUpdatePopulation = () => {
    Alert.prompt(
      'Update Population',
      'Enter the total number of individuals in this communal (tracked + untracked):',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async (value) => {
            const count = parseInt(value || '');
            if (isNaN(count) || count < 0) {
              Alert.alert('Invalid', 'Please enter a valid number');
              return;
            }
            try {
              await apiClient.put(`/enclosures/${id}`, { population_count: count });
              fetchEnclosure();
            } catch {
              Alert.alert('Error', 'Failed to update population');
            }
          },
        },
      ],
      'plain-text',
      String(enclosure?.population_count || enclosure?.inhabitant_count || '')
    );
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

  const getIncidentMeta = (type: string) =>
    INCIDENT_TYPES.find(t => t.value === type) ?? INCIDENT_TYPES[8];

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
      fontSize: 11,
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
    // Inhabitants
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
    untrackedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(147, 51, 234, 0.1)',
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: 'rgba(147, 51, 234, 0.25)',
    },
    untrackedPillText: {
      fontSize: 13,
      color: '#9333ea',
      fontWeight: '500',
      flex: 1,
    },
    populationUpdateBtn: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: 'rgba(147, 51, 234, 0.15)',
    },
    populationUpdateBtnText: {
      fontSize: 12,
      color: '#9333ea',
      fontWeight: '600',
    },
    // Log cards
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
    logDeleteBtn: {
      padding: 4,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textTertiary,
      marginTop: 12,
      textAlign: 'center',
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
    textArea: {
      height: 80,
      textAlignVertical: 'top',
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
    // Incident-specific
    incidentFormCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    formLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
      marginTop: 12,
    },
    typeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    typeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    typeChipText: {
      fontSize: 13,
      fontWeight: '500',
    },
    severityRow: {
      flexDirection: 'row',
      gap: 8,
    },
    severityChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
    },
    severityChipText: {
      fontSize: 13,
      fontWeight: '600',
    },
    incidentCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    incidentCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    incidentTypeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    incidentTypeBadgeText: {
      fontSize: 12,
      fontWeight: '600',
    },
    incidentDate: {
      fontSize: 13,
      color: colors.textTertiary,
      marginLeft: 'auto',
    },
    incidentDetail: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 6,
      lineHeight: 20,
    },
    incidentOutcome: {
      fontSize: 13,
      color: colors.textTertiary,
      marginTop: 4,
      fontStyle: 'italic',
    },
    incidentFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
    },
    incidentSubject: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '500',
    },
  });

  if (loading || !enclosure) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <MaterialCommunityIcons name="loading" size={40} color={colors.primary} />
      </View>
    );
  }

  const untrackedCount =
    enclosure.is_communal && enclosure.population_count !== null
      ? Math.max(0, enclosure.population_count - inhabitants.length)
      : 0;

  // ─── Tab render functions ──────────────────────────────────────────────────

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
                  {enclosure.target_temp_min || '?'}°F – {enclosure.target_temp_max || '?'}°F
                </Text>
              </View>
            )}
            {(enclosure.target_humidity_min || enclosure.target_humidity_max) && (
              <View style={[styles.infoRow, styles.infoRowLast]}>
                <Text style={styles.infoLabel}>Humidity</Text>
                <Text style={styles.infoValue}>
                  {enclosure.target_humidity_min || '?'}% – {enclosure.target_humidity_max || '?'}%
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

  const renderInhabitantsTab = () => {
    const total = enclosure.is_communal
      ? (enclosure.population_count ?? inhabitants.length)
      : inhabitants.length;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Inhabitants ({total})
        </Text>

        {/* Untracked members banner */}
        {enclosure.is_communal && untrackedCount > 0 && (
          <View style={styles.untrackedPill}>
            <MaterialCommunityIcons name="account-question" size={18} color="#9333ea" />
            <Text style={styles.untrackedPillText}>
              {untrackedCount} untracked {untrackedCount === 1 ? 'member' : 'members'} in population
            </Text>
            <TouchableOpacity style={styles.populationUpdateBtn} onPress={handleUpdatePopulation}>
              <Text style={styles.populationUpdateBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Add inhabitant button (communal only) */}
        {enclosure.is_communal && (
          <TouchableOpacity style={[styles.addLogButton, { marginBottom: 12 }]} onPress={handleAddInhabitant}>
            <MaterialCommunityIcons name="spider-web" size={20} color={colors.primary} />
            <Text style={styles.addLogButtonText}>Add Tracked Member</Text>
          </TouchableOpacity>
        )}

        {inhabitants.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="spider" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              {enclosure.is_communal && enclosure.population_count
                ? `${enclosure.population_count} untracked individuals\nAdd tracked members to see them here`
                : 'No inhabitants assigned yet'}
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

        {/* Update population count prompt for communal with no population_count set */}
        {enclosure.is_communal && enclosure.population_count === null && (
          <TouchableOpacity
            style={[styles.addLogButton, { marginTop: 12, borderColor: '#9333ea' }]}
            onPress={handleUpdatePopulation}
          >
            <MaterialCommunityIcons name="account-group" size={20} color="#9333ea" />
            <Text style={[styles.addLogButtonText, { color: '#9333ea' }]}>Set Total Population Count</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

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
            <PrimaryButton
              onPress={handleQuickFeeding}
              disabled={submittingFeeding}
              outerStyle={styles.submitButton}
              style={styles.submitButtonGradient}
            >
              <Text style={styles.submitButtonText}>
                {submittingFeeding ? 'Saving...' : 'Log Feeding'}
              </Text>
            </PrimaryButton>
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

  const renderIncidentsTab = () => (
    <View style={styles.section}>
      {showIncidentForm ? (
        <View style={styles.incidentFormCard}>
          <Text style={styles.quickFeedingTitle}>Log an Incident</Text>

          <Text style={styles.formLabel}>Incident Type</Text>
          <View style={styles.typeGrid}>
            {INCIDENT_TYPES.map((t) => {
              const selected = incidentType === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  style={[
                    styles.typeChip,
                    selected && { backgroundColor: t.bg, borderColor: t.color },
                  ]}
                  onPress={() => setIncidentType(t.value)}
                >
                  <MaterialCommunityIcons
                    name={t.icon as any}
                    size={14}
                    color={selected ? t.color : colors.textTertiary}
                  />
                  <Text style={[styles.typeChipText, { color: selected ? t.color : colors.textSecondary }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {SEVERITY_TYPES.includes(incidentType) && (
            <>
              <Text style={styles.formLabel}>Severity</Text>
              <View style={styles.severityRow}>
                {SEVERITY_OPTIONS.map((s) => {
                  const selected = incidentSeverity === s.value;
                  return (
                    <TouchableOpacity
                      key={s.value}
                      style={[
                        styles.severityChip,
                        {
                          borderColor: selected ? s.color : colors.border,
                          backgroundColor: selected ? s.color + '22' : 'transparent',
                        },
                      ]}
                      onPress={() => setIncidentSeverity(s.value)}
                    >
                      <Text style={[styles.severityChipText, { color: selected ? s.color : colors.textTertiary }]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <Text style={styles.formLabel}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="What happened?"
            placeholderTextColor={colors.textTertiary}
            value={incidentDescription}
            onChangeText={setIncidentDescription}
            multiline
          />

          <Text style={styles.formLabel}>Outcome (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Separated individual, Removed prey item"
            placeholderTextColor={colors.textTertiary}
            value={incidentOutcome}
            onChangeText={setIncidentOutcome}
          />

          <View style={[styles.buttonRow, { marginTop: 16 }]}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowIncidentForm(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <PrimaryButton
              onPress={handleLogIncident}
              disabled={submittingIncident}
              outerStyle={styles.submitButton}
              style={styles.submitButtonGradient}
            >
              {submittingIncident ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Log Incident</Text>
              )}
            </PrimaryButton>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.addLogButton} onPress={() => setShowIncidentForm(true)}>
          <MaterialCommunityIcons name="alert-plus" size={20} color={colors.primary} />
          <Text style={styles.addLogButtonText}>Log an Incident</Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Incident History</Text>
      {incidents.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="shield-check" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No incidents logged{'\n'}All quiet in this communal</Text>
        </View>
      ) : (
        incidents.map((incident) => {
          const meta = getIncidentMeta(incident.incident_type);
          const severityOpt = SEVERITY_OPTIONS.find(s => s.value === incident.severity);
          return (
            <View key={incident.id} style={styles.incidentCard}>
              <View style={styles.incidentCardHeader}>
                <View style={[styles.incidentTypeBadge, { backgroundColor: meta.bg }]}>
                  <MaterialCommunityIcons name={meta.icon as any} size={13} color={meta.color} />
                  <Text style={[styles.incidentTypeBadgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
                {severityOpt && (
                  <View style={[styles.logBadge, { backgroundColor: severityOpt.color + '22' }]}>
                    <Text style={[styles.logBadgeText, { color: severityOpt.color }]}>
                      {severityOpt.label}
                    </Text>
                  </View>
                )}
                <Text style={styles.incidentDate}>{formatDate(incident.occurred_at)}</Text>
              </View>

              {incident.description && (
                <Text style={styles.incidentDetail}>{incident.description}</Text>
              )}

              <View style={styles.incidentFooter}>
                <View>
                  {incident.tarantula_name && (
                    <Text style={styles.incidentSubject}>
                      Individual: {incident.tarantula_name}
                    </Text>
                  )}
                  {incident.outcome && (
                    <Text style={styles.incidentOutcome}>↳ {incident.outcome}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.logDeleteBtn}
                  onPress={() => handleDeleteIncident(incident.id)}
                  accessibilityLabel="Delete incident"
                >
                  <MaterialCommunityIcons name="delete-outline" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </View>
  );

  // ─── Tab definitions ───────────────────────────────────────────────────────

  const allTabs: { key: TabType; label: string }[] = [
    { key: 'info', label: 'Info' },
    { key: 'inhabitants', label: 'Members' },
    { key: 'feedings', label: 'Feeding' },
    { key: 'molts', label: 'Molts' },
    { key: 'substrate', label: 'Substrate' },
    ...(enclosure.is_communal ? [{ key: 'incidents' as TabType, label: 'Incidents' }] : []),
  ];

  const population = enclosure.is_communal
    ? (enclosure.population_count || enclosure.inhabitant_count)
    : enclosure.inhabitant_count;

  const backButton = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const headerRightActions = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <TouchableOpacity
        style={{ padding: 6 }}
        onPress={() => router.push(`/enclosure/edit?id=${id}`)}
        accessibilityLabel="Edit enclosure"
      >
        <MaterialCommunityIcons name="pencil" size={22} color={iconColor} />
      </TouchableOpacity>
      <TouchableOpacity
        style={{ padding: 6 }}
        onPress={handleDelete}
        accessibilityLabel="Delete enclosure"
      >
        <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <AppHeader
        title={enclosure.name}
        subtitle={enclosure.species_name || undefined}
        leftAction={backButton}
        rightAction={headerRightActions}
      />
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Hero Image */}
        <View style={styles.header}>
          {enclosure.photo_url ? (
            <Image source={{ uri: getImageUrl(enclosure.photo_url) }} style={styles.headerImage} />
          ) : (
            <View style={styles.headerPlaceholder}>
              <MaterialCommunityIcons name="home-variant" size={64} color={colors.textTertiary} />
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.titleContainer}>
          {enclosure.is_communal && (
            <View style={styles.titleRow}>
              <View style={styles.communalBadge}>
                <Text style={styles.communalBadgeText}>Communal</Text>
              </View>
            </View>
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
            {enclosure.is_communal && incidents.length > 0 && (
              <View style={styles.statItem}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#f97316" />
                <Text style={[styles.statText, { color: '#f97316' }]}>
                  {incidents.length} {incidents.length === 1 ? 'incident' : 'incidents'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Tabs — scroll horizontally if many */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
          {allTabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, { minWidth: 70 }, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Content */}
        <View style={styles.content}>
          {activeTab === 'info' && renderInfoTab()}
          {activeTab === 'inhabitants' && renderInhabitantsTab()}
          {activeTab === 'feedings' && renderFeedingsTab()}
          {activeTab === 'molts' && renderMoltsTab()}
          {activeTab === 'substrate' && renderSubstrateTab()}
          {activeTab === 'incidents' && renderIncidentsTab()}
        </View>
      </ScrollView>
    </View>
  );
}
