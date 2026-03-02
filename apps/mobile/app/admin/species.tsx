import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Species {
  id: string;
  scientific_name: string;
  common_names: string[];
  genus: string;
  family: string;
  care_level: string;
  type: string;
  is_verified: boolean;
  image_url?: string;
}

type FilterType = 'all' | 'verified' | 'unverified';

export default function AdminSpeciesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [species, setSpecies] = useState<Species[]>([]);
  const [filteredSpecies, setFilteredSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVerified, setFilterVerified] = useState<FilterType>('all');
  const [editingSpecies, setEditingSpecies] = useState<Species | null>(null);
  const [editForm, setEditForm] = useState<Partial<Species>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.is_superuser) {
      Alert.alert('Access Denied', 'You do not have admin privileges.');
      router.back();
      return;
    }
    fetchSpecies();
  }, []);

  useEffect(() => {
    let filtered = species;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s =>
        s.scientific_name.toLowerCase().includes(q) ||
        s.common_names?.some(name => name.toLowerCase().includes(q)) ||
        s.genus?.toLowerCase().includes(q)
      );
    }

    if (filterVerified === 'verified') {
      filtered = filtered.filter(s => s.is_verified);
    } else if (filterVerified === 'unverified') {
      filtered = filtered.filter(s => !s.is_verified);
    }

    setFilteredSpecies(filtered);
  }, [searchQuery, filterVerified, species]);

  const fetchSpecies = async () => {
    try {
      const response = await apiClient.get('/species/?limit=1000');
      const data = response.data.species || response.data;
      setSpecies(data);
      setFilteredSpecies(data);
    } catch (error) {
      console.error('Failed to fetch species:', error);
      Alert.alert('Error', 'Failed to load species database');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (s: Species) => {
    setEditingSpecies(s);
    setEditForm({
      scientific_name: s.scientific_name,
      common_names: s.common_names,
      genus: s.genus,
      family: s.family,
      care_level: s.care_level,
      type: s.type,
      is_verified: s.is_verified,
    });
  };

  const handleSave = async () => {
    if (!editingSpecies) return;
    setSaving(true);
    try {
      await apiClient.put(`/species/${editingSpecies.id}`, editForm);
      await fetchSpecies();
      setEditingSpecies(null);
      setEditForm({});
    } catch (error) {
      console.error('Failed to update species:', error);
      Alert.alert('Error', 'Failed to update species');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (s: Species) => {
    Alert.alert(
      'Delete Species',
      `Are you sure you want to delete "${s.scientific_name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/species/${s.id}`);
              await fetchSpecies();
            } catch (error) {
              console.error('Failed to delete species:', error);
              Alert.alert('Error', 'Failed to delete species');
            }
          },
        },
      ]
    );
  };

  const toggleVerified = async (s: Species) => {
    try {
      await apiClient.put(`/species/${s.id}`, { is_verified: !s.is_verified });
      await fetchSpecies();
    } catch (error) {
      console.error('Failed to toggle verification:', error);
      Alert.alert('Error', 'Failed to update verification status');
    }
  };

  const careLevelColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'beginner': return { bg: '#dcfce7', text: '#166534' };
      case 'intermediate': return { bg: '#fef9c3', text: '#854d0e' };
      case 'advanced': return { bg: '#fecaca', text: '#991b1b' };
      default: return { bg: colors.surface, text: colors.textSecondary };
    }
  };

  const typeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'terrestrial': return { bg: '#dbeafe', text: '#1e40af' };
      case 'arboreal': return { bg: '#d1fae5', text: '#065f46' };
      case 'fossorial': return { bg: '#fde68a', text: '#92400e' };
      default: return { bg: colors.surface, text: colors.textSecondary };
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Manage Species</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search & Filters */}
      <View style={[styles.filterBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.searchContainer, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search species..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {(['all', 'verified', 'unverified'] as FilterType[]).map(filter => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                { borderColor: colors.border },
                filterVerified === filter && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setFilterVerified(filter)}
            >
              <Text style={[
                styles.filterChipText,
                { color: colors.textSecondary },
                filterVerified === filter && { color: '#fff' },
              ]}>
                {filter === 'all' ? 'All' : filter === 'verified' ? 'Verified' : 'Unverified'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.resultCount, { color: colors.textTertiary }]}>
          {filteredSpecies.length} of {species.length} species
        </Text>
      </View>

      {/* Species List */}
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {filteredSpecies.map(s => {
          const cl = careLevelColor(s.care_level);
          const tc = typeColor(s.type);
          return (
            <View key={s.id} style={[styles.speciesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.scientificName, { color: colors.textPrimary }]}>{s.scientific_name}</Text>
                  <Text style={[styles.commonName, { color: colors.textSecondary }]} numberOfLines={1}>
                    {s.common_names?.join(', ') || 'No common names'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => toggleVerified(s)} style={styles.verifiedBadge}>
                  <MaterialCommunityIcons
                    name={s.is_verified ? 'check-decagram' : 'decagram-outline'}
                    size={22}
                    color={s.is_verified ? '#16a34a' : colors.textTertiary}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: tc.bg }]}>
                  <Text style={[styles.badgeText, { color: tc.text }]}>{s.type || 'Unknown'}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: cl.bg }]}>
                  <Text style={[styles.badgeText, { color: cl.text }]}>{s.care_level || 'Unknown'}</Text>
                </View>
                {s.genus ? (
                  <View style={[styles.badge, { backgroundColor: colors.surfaceElevated }]}>
                    <Text style={[styles.badgeText, { color: colors.textSecondary }]}>{s.genus}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary + '15' }]} onPress={() => handleEdit(s)}>
                  <MaterialCommunityIcons name="pencil" size={16} color={colors.primary} />
                  <Text style={[styles.actionBtnText, { color: colors.primary }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#ef444415' }]} onPress={() => handleDelete(s)}>
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color="#ef4444" />
                  <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {filteredSpecies.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="magnify" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No species found</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={!!editingSpecies} transparent animationType="slide" onRequestClose={() => setEditingSpecies(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Edit Species</Text>
              <TouchableOpacity onPress={() => setEditingSpecies(null)}>
                <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalForm}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Scientific Name</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
                value={editForm.scientific_name || ''}
                onChangeText={text => setEditForm({ ...editForm, scientific_name: text })}
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Common Names (comma-separated)</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
                value={editForm.common_names?.join(', ') || ''}
                onChangeText={text => setEditForm({ ...editForm, common_names: text.split(',').map(n => n.trim()) })}
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Genus</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
                value={editForm.genus || ''}
                onChangeText={text => setEditForm({ ...editForm, genus: text })}
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Family</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}
                value={editForm.family || ''}
                onChangeText={text => setEditForm({ ...editForm, family: text })}
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Type</Text>
              <View style={styles.chipRow}>
                {['terrestrial', 'arboreal', 'fossorial'].map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.selectChip,
                      { borderColor: colors.border },
                      editForm.type === type && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => setEditForm({ ...editForm, type })}
                  >
                    <Text style={[
                      styles.selectChipText,
                      { color: colors.textSecondary },
                      editForm.type === type && { color: '#fff' },
                    ]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Care Level</Text>
              <View style={styles.chipRow}>
                {['beginner', 'intermediate', 'advanced'].map(level => (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.selectChip,
                      { borderColor: colors.border },
                      editForm.care_level === level && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => setEditForm({ ...editForm, care_level: level })}
                  >
                    <Text style={[
                      styles.selectChipText,
                      { color: colors.textSecondary },
                      editForm.care_level === level && { color: '#fff' },
                    ]}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.verifiedToggle}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 0 }]}>Verified</Text>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    { backgroundColor: editForm.is_verified ? '#16a34a' : colors.surfaceElevated },
                  ]}
                  onPress={() => setEditForm({ ...editForm, is_verified: !editForm.is_verified })}
                >
                  <MaterialCommunityIcons
                    name={editForm.is_verified ? 'check' : 'close'}
                    size={18}
                    color={editForm.is_verified ? '#fff' : colors.textTertiary}
                  />
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.surfaceElevated }]}
                onPress={() => setEditingSpecies(null)}
                disabled={saving}
              >
                <Text style={[styles.modalBtnText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  filterBar: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 15, marginLeft: 8, padding: 0 },
  filterRow: { flexDirection: 'row', marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  filterChipText: { fontSize: 13, fontWeight: '500' },
  resultCount: { fontSize: 12 },
  list: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  speciesCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  scientificName: { fontSize: 15, fontWeight: '600', fontStyle: 'italic' },
  commonName: { fontSize: 13, marginTop: 2 },
  verifiedBadge: { padding: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionBtnText: { fontSize: 13, fontWeight: '500' },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, marginTop: 12 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 34,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  modalForm: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  selectChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  selectChipText: { fontSize: 13, fontWeight: '500' },
  verifiedToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  toggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalBtnText: { fontSize: 16, fontWeight: '600' },
});
