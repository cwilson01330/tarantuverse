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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Species {
  id: string;
  scientific_name: string;
  common_names: string[];
}

export default function AddEnclosureScreen() {
  const router = useRouter();
  const { colors } = useTheme();

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

  // Loading state
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (speciesQuery.length >= 2) {
      searchSpecies();
    } else {
      setSpeciesResults([]);
    }
  }, [speciesQuery]);

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
      }

      if (isCommunal && populationCount) {
        data.population_count = parseInt(populationCount);
      }

      if (enclosureType) data.enclosure_type = enclosureType;
      if (enclosureSize) data.enclosure_size = enclosureSize;
      if (substrateType) data.substrate_type = substrateType;
      if (substrateDepth) data.substrate_depth = substrateDepth;
      if (mistingSchedule) data.misting_schedule = mistingSchedule;
      if (tempMin) data.target_temp_min = parseFloat(tempMin);
      if (tempMax) data.target_temp_max = parseFloat(tempMax);
      if (humidityMin) data.target_humidity_min = parseFloat(humidityMin);
      if (humidityMax) data.target_humidity_max = parseFloat(humidityMax);
      if (notes) data.notes = notes;

      const response = await apiClient.post('/enclosures/', data);
      Alert.alert('Success', 'Enclosure created successfully');
      router.replace(`/enclosure/${response.data.id}`);
    } catch (error: any) {
      console.error('Failed to create enclosure:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create enclosure');
    } finally {
      setSubmitting(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Enclosure</Text>
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
                onPress={() => setEnclosureType(type.value)}
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
                <MaterialCommunityIcons name="home-plus" size={24} color="#fff" />
                <Text style={styles.submitText}>Create Enclosure</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
