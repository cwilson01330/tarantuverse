import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { apiClient } from '../../src/services/api';

interface TarantulaData {
  name: string;
  common_name: string;
  scientific_name: string;
  sex?: string;
  date_acquired?: string;
  source?: string;
  enclosure_type?: string;
  enclosure_size?: string;
  substrate_type?: string;
  substrate_depth?: string;
  last_substrate_change?: string;
  target_temp_min?: number;
  target_temp_max?: number;
  target_humidity_min?: number;
  target_humidity_max?: number;
  water_dish?: boolean;
  misting_schedule?: string;
  notes?: string;
}

export default function EditTarantulaScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSubstrateDatePicker, setShowSubstrateDatePicker] = useState(false);
  
  const [formData, setFormData] = useState<TarantulaData>({
    name: '',
    common_name: '',
    scientific_name: '',
    sex: undefined,
    date_acquired: undefined,
    source: undefined,
    enclosure_type: undefined,
    enclosure_size: undefined,
    substrate_type: undefined,
    substrate_depth: undefined,
    last_substrate_change: undefined,
    target_temp_min: undefined,
    target_temp_max: undefined,
    target_humidity_min: undefined,
    target_humidity_max: undefined,
    water_dish: undefined,
    misting_schedule: undefined,
    notes: undefined,
  });

  useEffect(() => {
    fetchTarantula();
  }, [id]);

  const fetchTarantula = async () => {
    try {
      const response = await apiClient.get(`/tarantulas/${id}`);
      const data = response.data;
      
      setFormData({
        name: data.name || '',
        common_name: data.common_name || '',
        scientific_name: data.scientific_name || '',
        sex: data.sex,
        date_acquired: data.date_acquired,
        source: data.source,
        enclosure_type: data.enclosure_type,
        enclosure_size: data.enclosure_size,
        substrate_type: data.substrate_type,
        substrate_depth: data.substrate_depth,
        last_substrate_change: data.last_substrate_change,
        target_temp_min: data.target_temp_min,
        target_temp_max: data.target_temp_max,
        target_humidity_min: data.target_humidity_min,
        target_humidity_max: data.target_humidity_max,
        water_dish: data.water_dish,
        misting_schedule: data.misting_schedule,
        notes: data.notes,
      });
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load tarantula details');
      console.error(error);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    setSaving(true);
    try {
      await apiClient.put(`/tarantulas/${id}`, formData);
      Alert.alert('Success', 'Tarantula updated successfully');
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update tarantula');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString();
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setFormData({ ...formData, date_acquired: selectedDate.toISOString().split('T')[0] });
    }
  };

  const onSubstrateDateChange = (event: any, selectedDate?: Date) => {
    setShowSubstrateDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setFormData({ ...formData, last_substrate_change: selectedDate.toISOString().split('T')[0] });
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="close" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Tarantula</Text>
        <TouchableOpacity 
          onPress={handleSave} 
          style={styles.saveButton}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#7c3aed" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Basic Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              placeholder="Enter name"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Common Name</Text>
            <TextInput
              style={styles.input}
              value={formData.common_name}
              onChangeText={(text) => setFormData({ ...formData, common_name: text })}
              placeholder="e.g., Mexican Redknee"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Scientific Name</Text>
            <TextInput
              style={styles.input}
              value={formData.scientific_name}
              onChangeText={(text) => setFormData({ ...formData, scientific_name: text })}
              placeholder="e.g., Brachypelma hamorii"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Sex</Text>
            <View style={styles.sexButtons}>
              {['Male', 'Female', 'Unknown'].map((sex) => (
                <TouchableOpacity
                  key={sex}
                  style={[
                    styles.sexButton,
                    formData.sex === sex && styles.sexButtonActive
                  ]}
                  onPress={() => setFormData({ ...formData, sex })}
                >
                  <Text style={[
                    styles.sexButtonText,
                    formData.sex === sex && styles.sexButtonTextActive
                  ]}>
                    {sex}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date Acquired</Text>
            <TouchableOpacity 
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateButtonText}>
                {formatDate(formData.date_acquired)}
              </Text>
              <MaterialCommunityIcons name="calendar" size={20} color="#6b7280" />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={formData.date_acquired ? new Date(formData.date_acquired) : new Date()}
                mode="date"
                display="default"
                onChange={onDateChange}
              />
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Source</Text>
            <TextInput
              style={styles.input}
              value={formData.source}
              onChangeText={(text) => setFormData({ ...formData, source: text })}
              placeholder="Where did you get it?"
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>

        {/* Enclosure */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Enclosure Setup</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Enclosure Type</Text>
            <TextInput
              style={styles.input}
              value={formData.enclosure_type}
              onChangeText={(text) => setFormData({ ...formData, enclosure_type: text })}
              placeholder="e.g., Terrestrial, Arboreal"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Enclosure Size</Text>
            <TextInput
              style={styles.input}
              value={formData.enclosure_size}
              onChangeText={(text) => setFormData({ ...formData, enclosure_size: text })}
              placeholder="e.g., 10x10x10 inches"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Substrate Type</Text>
            <TextInput
              style={styles.input}
              value={formData.substrate_type}
              onChangeText={(text) => setFormData({ ...formData, substrate_type: text })}
              placeholder="e.g., Coco fiber"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Substrate Depth</Text>
            <TextInput
              style={styles.input}
              value={formData.substrate_depth}
              onChangeText={(text) => setFormData({ ...formData, substrate_depth: text })}
              placeholder="e.g., 3 inches"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Last Substrate Change</Text>
            <TouchableOpacity 
              style={styles.dateButton}
              onPress={() => setShowSubstrateDatePicker(true)}
            >
              <Text style={styles.dateButtonText}>
                {formatDate(formData.last_substrate_change)}
              </Text>
              <MaterialCommunityIcons name="calendar" size={20} color="#6b7280" />
            </TouchableOpacity>
            {showSubstrateDatePicker && (
              <DateTimePicker
                value={formData.last_substrate_change ? new Date(formData.last_substrate_change) : new Date()}
                mode="date"
                display="default"
                onChange={onSubstrateDateChange}
              />
            )}
          </View>
        </View>

        {/* Environment */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Environment</Text>
          
          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Min Temp (°F)</Text>
              <TextInput
                style={styles.input}
                value={formData.target_temp_min?.toString()}
                onChangeText={(text) => setFormData({ ...formData, target_temp_min: text ? parseInt(text) : undefined })}
                placeholder="72"
                keyboardType="numeric"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Max Temp (°F)</Text>
              <TextInput
                style={styles.input}
                value={formData.target_temp_max?.toString()}
                onChangeText={(text) => setFormData({ ...formData, target_temp_max: text ? parseInt(text) : undefined })}
                placeholder="78"
                keyboardType="numeric"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Min Humidity (%)</Text>
              <TextInput
                style={styles.input}
                value={formData.target_humidity_min?.toString()}
                onChangeText={(text) => setFormData({ ...formData, target_humidity_min: text ? parseInt(text) : undefined })}
                placeholder="60"
                keyboardType="numeric"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Max Humidity (%)</Text>
              <TextInput
                style={styles.input}
                value={formData.target_humidity_max?.toString()}
                onChangeText={(text) => setFormData({ ...formData, target_humidity_max: text ? parseInt(text) : undefined })}
                placeholder="70"
                keyboardType="numeric"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.checkboxRow}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => setFormData({ ...formData, water_dish: !formData.water_dish })}
              >
                {formData.water_dish && (
                  <MaterialCommunityIcons name="check" size={18} color="#7c3aed" />
                )}
              </TouchableOpacity>
              <Text style={styles.checkboxLabel}>Has Water Dish</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Misting Schedule</Text>
            <TextInput
              style={styles.input}
              value={formData.misting_schedule}
              onChangeText={(text) => setFormData({ ...formData, misting_schedule: text })}
              placeholder="e.g., Twice weekly"
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          
          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.notes}
              onChangeText={(text) => setFormData({ ...formData, notes: text })}
              placeholder="Additional notes..."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7c3aed',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 100,
  },
  sexButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  sexButton: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    alignItems: 'center',
  },
  sexButtonActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  sexButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  sexButtonTextActive: {
    color: '#fff',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#1f2937',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 4,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#1f2937',
  },
});
