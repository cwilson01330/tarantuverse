import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Species {
  id: string;
  scientific_name: string;
  common_names: string[];
}

export default function EditEnclosureScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();

  // Loading state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Basic info
  const [name, setName] = useState('');
  const [isCommunal, setIsCommunal] = useState(false);
  const [populationCount, setPopulationCount] = useState('');

  // Species search
  const [speciesQuery, setSpeciesQuery] = useState('');
  const [speciesResults, setSpeciesResults] = useState<Species[]>([]);
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);
  const [showSpeciesDropdown, setShowSpeciesDropdown] = useState(false);

  // Enclosure properties
  const [enclosureType, setEnclosureType] = useState<string | null>(null);
  const [enclosureSize, setEnclosureSize] = useState('');
  const [substrateType, setSubstrateType] = useState('');
  const [substrateDepth, setSubstrateDepth] = useState('');
  const [waterDish, setWaterDish] = useState(true);
  const [mistingSchedule, setMistingSchedule] = useState('');

  // Climate
  const [tempMin, setTempMin] = useState('');
  const [tempMax, setTempMax] = useState('');
  const [humidityMin, setHumidityMin] = useState('');
  const [humidityMax, setHumidityMax] = useState('');

  // Notes
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchEnclosure();
  }, [id]);

  useEffect(() => {
    if (speciesQuery.length >= 2 && !selectedSpecies) {
      searchSpecies();
    } else {
      setSpeciesResults([]);
    }
  }, [speciesQuery]);

  const fetchEnclosure = async () => {
    try {
      const response = await apiClient.get(`/enclosures/${id}`);
      const data = response.data;

      setName(data.name || '');
      setIsCommunal(data.is_communal || false);
      setPopulationCount(data.population_count?.toString() || '');
      setEnclosureType(data.enclosure_type || null);
      setEnclosureSize(data.enclosure_size || '');
      setSubstrateType(data.substrate_type || '');
      setSubstrateDepth(data.substrate_depth || '');
      setWaterDish(data.water_dish ?? true);
      setMistingSchedule(data.misting_schedule || '');
      setTempMin(data.target_temp_min?.toString() || '');
      setTempMax(data.target_temp_max?.toString() || '');
      setHumidityMin(data.target_humidity_min?.toString() || '');
      setHumidityMax(data.target_humidity_max?.toString() || '');
      setNotes(data.notes || '');

      if (data.species_id && data.species_name) {
        setSelectedSpecies({ id: data.species_id, scientific_name: data.species_name, common_names: [] });
        setSpeciesQuery(data.species_name);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load enclosure');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const searchSpecies = async () => {
    try {
      const response = await apiClient.get(`/species/search?q=${encodeURIComponent(speciesQuery)}`);
      setSpeciesResults(response.data.slice(0, 5));
      setShowSpeciesDropdown(true);
    } catch (error) {
      console.error('Species search failed:', error);
    }
  };

  const selectSpecies = (species: Species) => {
    setSelectedSpecies(species);
    setSpeciesQuery(species.scientific_name);
    setShowSpeciesDropdown(false);
    setSpeciesResults([]);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter an enclosure name');
      return;
    }

    setSubmitting(true);

    try {
      const data: any = {
        name: name.trim(),
        is_communal: isCommunal,
        water_dish: waterDish,
      };

      if (selectedSpecies) {
        data.species_id = selectedSpecies.id;
      } else {
        data.species_id = null;
      }

      if (isCommunal && populationCount) {
        data.population_count = parseInt(populationCount);
      } else {
        data.population_count = null;
      }

      data.enclosure_type = enclosureType || null;
      data.enclosure_size = enclosureSize || null;
      data.substrate_type = substrateType || null;
      data.substrate_depth = substrateDepth || null;
      data.misting_schedule = mistingSchedule || null;
      data.target_temp_min = tempMin ? parseFloat(tempMin) : null;
      data.target_temp_max = tempMax ? parseFloat(tempMax) : null;
      data.target_humidity_min = humidityMin ? parseFloat(humidityMin) : null;
      data.target_humidity_max = humidityMax ? parseFloat(humidityMax) : null;
      data.notes = notes || null;

      await apiClient.put(`/enclosures/${id}`, data);
      Alert.alert('Success', 'Enclosure updated successfully');
      router.back();
    } catch (error: any) {
      console.error('Failed to update enclosure:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update enclosure');
    } finally {
      setSubmitting(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      marginRight: 16,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    content: {
      padding: 16,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 12,
    },
    inputGroup: {
      marginBottom: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 6,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    speciesContainer: {
      position: 'relative',
      zIndex: 1000,
    },
    speciesDropdown: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      maxHeight: 200,
      zIndex: 1000,
      elevation: 5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
    },
    speciesItem: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    speciesItemLast: {
      borderBottomWidth: 0,
    },
    speciesName: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    speciesCommon: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 2,
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    switchLabel: {
      fontSize: 16,
      color: colors.textPrimary,
    },
    typeSelector: {
      flexDirection: 'row',
      gap: 8,
    },
    typeButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    typeButtonActive: {
      borderColor: colors.primary,
      backgroundColor: `${colors.primary}15`,
    },
    typeIcon: {
      marginBottom: 4,
    },
    typeText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    typeTextActive: {
      color: colors.primary,
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    halfWidth: {
      flex: 1,
    },
    submitButton: {
      marginTop: 8,
      marginBottom: 40,
      borderRadius: 12,
      overflow: 'hidden',
    },
    submitGradient: {
      paddingVertical: 16,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
    },
    submitText: {
      fontSize: 18,
      fontWeight: '600',
      color: '#fff',
    },
    textArea: {
      height: 100,
      textAlignVertical: 'top',
    },
  });

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Enclosure</Text>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Enclosure Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Balfouri Colony 1"
              placeholderTextColor={colors.textTertiary}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Communal Setup</Text>
              <Switch
                value={isCommunal}
                onValueChange={setIsCommunal}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
          </View>

          {isCommunal && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Population Count</Text>
              <TextInput
                style={styles.input}
                placeholder="Number of spiders in colony"
                placeholderTextColor={colors.textTertiary}
                value={populationCount}
                onChangeText={setPopulationCount}
                keyboardType="number-pad"
              />
            </View>
          )}

          <View style={[styles.inputGroup, styles.speciesContainer]}>
            <Text style={styles.label}>Species (for communals)</Text>
            <TextInput
              style={styles.input}
              placeholder="Search species..."
              placeholderTextColor={colors.textTertiary}
              value={speciesQuery}
              onChangeText={(text) => {
                setSpeciesQuery(text);
                if (selectedSpecies && text !== selectedSpecies.scientific_name) {
                  setSelectedSpecies(null);
                }
              }}
              onFocus={() => {
                if (speciesResults.length > 0) setShowSpeciesDropdown(true);
              }}
            />
            {showSpeciesDropdown && speciesResults.length > 0 && (
              <View style={styles.speciesDropdown}>
                {speciesResults.map((species, index) => (
                  <TouchableOpacity
                    key={species.id}
                    style={[
                      styles.speciesItem,
                      index === speciesResults.length - 1 && styles.speciesItemLast,
                    ]}
                    onPress={() => selectSpecies(species)}
                  >
                    <Text style={styles.speciesName}>{species.scientific_name}</Text>
                    {species.common_names?.length > 0 && (
                      <Text style={styles.speciesCommon}>{species.common_names[0]}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Enclosure Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Enclosure Type</Text>
          <View style={styles.typeSelector}>
            {[
              { value: 'terrestrial', icon: 'terrain', label: 'Terrestrial' },
              { value: 'arboreal', icon: 'tree', label: 'Arboreal' },
              { value: 'fossorial', icon: 'arrow-down-bold-circle', label: 'Fossorial' },
            ].map((type) => (
              <TouchableOpacity
                key={type.value}
                style={[styles.typeButton, enclosureType === type.value && styles.typeButtonActive]}
                onPress={() => setEnclosureType(enclosureType === type.value ? null : type.value)}
              >
                <MaterialCommunityIcons
                  name={type.icon as any}
                  size={24}
                  color={enclosureType === type.value ? colors.primary : colors.textTertiary}
                  style={styles.typeIcon}
                />
                <Text style={[styles.typeText, enclosureType === type.value && styles.typeTextActive]}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Enclosure Properties */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Enclosure Properties</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Size</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 18x18x12 inches"
              placeholderTextColor={colors.textTertiary}
              value={enclosureSize}
              onChangeText={setEnclosureSize}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Substrate Type</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Coco fiber"
                placeholderTextColor={colors.textTertiary}
                value={substrateType}
                onChangeText={setSubstrateType}
              />
            </View>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Substrate Depth</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 6 inches"
                placeholderTextColor={colors.textTertiary}
                value={substrateDepth}
                onChangeText={setSubstrateDepth}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Water Dish</Text>
              <Switch
                value={waterDish}
                onValueChange={setWaterDish}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Misting Schedule</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 2x weekly"
              placeholderTextColor={colors.textTertiary}
              value={mistingSchedule}
              onChangeText={setMistingSchedule}
            />
          </View>
        </View>

        {/* Climate Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Climate Settings</Text>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Temp Min (°F)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 75"
                placeholderTextColor={colors.textTertiary}
                value={tempMin}
                onChangeText={setTempMin}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Temp Max (°F)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 82"
                placeholderTextColor={colors.textTertiary}
                value={tempMax}
                onChangeText={setTempMax}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Humidity Min (%)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 70"
                placeholderTextColor={colors.textTertiary}
                value={humidityMin}
                onChangeText={setHumidityMin}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Humidity Max (%)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 80"
                placeholderTextColor={colors.textTertiary}
                value={humidityMax}
                onChangeText={setHumidityMax}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Additional notes about this enclosure..."
            placeholderTextColor={colors.textTertiary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.submitGradient}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="content-save" size={24} color="#fff" />
                <Text style={styles.submitText}>Save Changes</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
