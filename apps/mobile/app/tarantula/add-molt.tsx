import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { apiClient } from '../../src/services/api';

export default function AddMoltScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [moltDate, setMoltDate] = useState(new Date());
  const [showMoltDatePicker, setShowMoltDatePicker] = useState(false);
  const [premoltDate, setPremoltDate] = useState<Date | null>(null);
  const [showPremoltDatePicker, setShowPremoltDatePicker] = useState(false);
  const [legSpanBefore, setLegSpanBefore] = useState('');
  const [legSpanAfter, setLegSpanAfter] = useState('');
  const [weightBefore, setWeightBefore] = useState('');
  const [weightAfter, setWeightAfter] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/tarantulas/${id}/molts`, {
        molted_at: moltDate.toISOString(),
        premolt_started_at: premoltDate?.toISOString() || undefined,
        leg_span_before: legSpanBefore ? parseFloat(legSpanBefore) : undefined,
        leg_span_after: legSpanAfter ? parseFloat(legSpanAfter) : undefined,
        weight_before: weightBefore ? parseFloat(weightBefore) : undefined,
        weight_after: weightAfter ? parseFloat(weightAfter) : undefined,
        notes: notes.trim() || undefined,
      });

      Alert.alert('Success', 'Molt log added successfully');
      router.back();
    } catch (error: any) {
      console.error('Failed to save molt log:', error);
      Alert.alert('Error', 'Failed to save molt log');
    } finally {
      setSaving(false);
    }
  };

  const onMoltDateChange = (event: any, selectedDate?: Date) => {
    setShowMoltDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setMoltDate(selectedDate);
    }
  };

  const onPremoltDateChange = (event: any, selectedDate?: Date) => {
    setShowPremoltDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setPremoltDate(selectedDate);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="close" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Log Molt</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Molt Date */}
        <View style={styles.section}>
          <Text style={styles.label}>Molt Date *</Text>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowMoltDatePicker(true)}
          >
            <MaterialCommunityIcons name="calendar" size={20} color="#7c3aed" />
            <Text style={styles.inputText}>{moltDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
          {showMoltDatePicker && (
            <DateTimePicker
              value={moltDate}
              mode="date"
              display="default"
              onChange={onMoltDateChange}
              maximumDate={new Date()}
            />
          )}
        </View>

        {/* Premolt Start Date */}
        <View style={styles.section}>
          <Text style={styles.label}>Premolt Started (Optional)</Text>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowPremoltDatePicker(true)}
          >
            <MaterialCommunityIcons name="calendar" size={20} color="#7c3aed" />
            <Text style={styles.inputText}>
              {premoltDate ? premoltDate.toLocaleDateString() : 'Select date'}
            </Text>
          </TouchableOpacity>
          {showPremoltDatePicker && (
            <DateTimePicker
              value={premoltDate || new Date()}
              mode="date"
              display="default"
              onChange={onPremoltDateChange}
              maximumDate={new Date()}
            />
          )}
          {premoltDate && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setPremoltDate(null)}
            >
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Measurements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Measurements (Optional)</Text>
          
          <View style={styles.row}>
            <View style={styles.measurementGroup}>
              <Text style={styles.label}>Leg Span Before (inches)</Text>
              <TextInput
                style={styles.textInput}
                value={legSpanBefore}
                onChangeText={setLegSpanBefore}
                placeholder="0.0"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.measurementGroup}>
              <Text style={styles.label}>Leg Span After (inches)</Text>
              <TextInput
                style={styles.textInput}
                value={legSpanAfter}
                onChangeText={setLegSpanAfter}
                placeholder="0.0"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.measurementGroup}>
              <Text style={styles.label}>Weight Before (grams)</Text>
              <TextInput
                style={styles.textInput}
                value={weightBefore}
                onChangeText={setWeightBefore}
                placeholder="0.0"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.measurementGroup}>
              <Text style={styles.label}>Weight After (grams)</Text>
              <TextInput
                style={styles.textInput}
                value={weightAfter}
                onChangeText={setWeightAfter}
                placeholder="0.0"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={styles.textArea}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add any additional notes..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
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
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#7c3aed',
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    gap: 8,
  },
  inputText: {
    fontSize: 16,
    color: '#1f2937',
  },
  clearButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  clearButtonText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  measurementGroup: {
    flex: 1,
  },
  textInput: {
    padding: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    fontSize: 15,
    color: '#1f2937',
  },
  textArea: {
    padding: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    fontSize: 15,
    color: '#1f2937',
    minHeight: 100,
  },
});
