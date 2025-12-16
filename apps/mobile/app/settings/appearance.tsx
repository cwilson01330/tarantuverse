import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, THEME_PRESETS, ThemePreset, UserColors } from '../../src/contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';

export default function AppearanceSettings() {
  const router = useRouter();
  const {
    theme,
    themeType,
    presetId,
    customColors,
    colors,
    setTheme,
    setPreset,
    setCustomColors,
    resetToDefault,
    saveToAPI,
    loadFromAPI,
  } = useTheme();

  const [token, setToken] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Local state for custom color inputs
  const [localPrimary, setLocalPrimary] = useState(customColors?.primary || colors.primary);
  const [localSecondary, setLocalSecondary] = useState(customColors?.secondary || colors.secondary);
  const [localAccent, setLocalAccent] = useState(customColors?.accent || colors.accent);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('auth_token');
      if (!storedToken) {
        router.replace('/login');
        return;
      }
      setToken(storedToken);

      // Load from API
      await loadFromAPI(storedToken);

      // Check premium status
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      const response = await fetch(`${API_URL}/api/v1/promo-codes/me/limits`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        setIsPremium(data.is_premium || false);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await saveToAPI(token);
      Alert.alert('Success', 'Theme preferences saved!');
    } catch (error) {
      Alert.alert('Error', 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handlePresetSelect = (preset: ThemePreset) => {
    if (!preset.is_free && !isPremium) {
      Alert.alert('Premium Required', 'This theme requires a premium subscription');
      return;
    }
    setPreset(preset.id);
  };

  const handleCustomColorsApply = () => {
    if (!isPremium) {
      Alert.alert('Premium Required', 'Custom colors require a premium subscription');
      return;
    }
    setCustomColors({
      primary: localPrimary,
      secondary: localSecondary,
      accent: localAccent,
    });
  };

  const freePresets = Object.values(THEME_PRESETS).filter((p) => p.is_free);
  const premiumPresets = Object.values(THEME_PRESETS).filter((p) => !p.is_free);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Appearance</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveButton}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.saveText, { color: colors.primary }]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Color Mode Section */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Color Mode</Text>
          <View style={styles.modeButtons}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                { borderColor: theme === 'light' ? colors.primary : colors.border },
                theme === 'light' && { backgroundColor: colors.primary + '20' },
              ]}
              onPress={() => setTheme('light')}
            >
              <Ionicons
                name="sunny"
                size={28}
                color={theme === 'light' ? colors.primary : colors.textTertiary}
              />
              <Text
                style={[
                  styles.modeLabel,
                  { color: theme === 'light' ? colors.primary : colors.textSecondary },
                ]}
              >
                Light
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeButton,
                { borderColor: theme === 'dark' ? colors.primary : colors.border },
                theme === 'dark' && { backgroundColor: colors.primary + '20' },
              ]}
              onPress={() => setTheme('dark')}
            >
              <Ionicons
                name="moon"
                size={28}
                color={theme === 'dark' ? colors.primary : colors.textTertiary}
              />
              <Text
                style={[
                  styles.modeLabel,
                  { color: theme === 'dark' ? colors.primary : colors.textSecondary },
                ]}
              >
                Dark
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Free Themes Section */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Free Themes</Text>
          <View style={styles.presetsGrid}>
            {freePresets.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                isSelected={
                  (themeType === 'default' && preset.id === 'default') ||
                  (themeType === 'preset' && presetId === preset.id)
                }
                isPremium={isPremium}
                colors={colors}
                onPress={() => handlePresetSelect(preset)}
              />
            ))}
          </View>
        </View>

        {/* Premium Themes Section */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Premium Themes</Text>
            {!isPremium && (
              <View style={[styles.premiumBadge, { backgroundColor: colors.warning + '30' }]}>
                <Text style={[styles.premiumBadgeText, { color: colors.warning }]}>Upgrade</Text>
              </View>
            )}
          </View>
          <View style={styles.presetsGrid}>
            {premiumPresets.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                isSelected={themeType === 'preset' && presetId === preset.id}
                isPremium={isPremium}
                colors={colors}
                onPress={() => handlePresetSelect(preset)}
              />
            ))}
          </View>
        </View>

        {/* Custom Colors Section */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Custom Colors</Text>
            {!isPremium && (
              <View style={[styles.premiumBadge, { backgroundColor: colors.warning + '30' }]}>
                <Ionicons name="lock-closed" size={12} color={colors.warning} />
                <Text style={[styles.premiumBadgeText, { color: colors.warning }]}>Premium</Text>
              </View>
            )}
          </View>

          <View style={{ opacity: isPremium ? 1 : 0.5 }}>
            <ColorInput
              label="Primary"
              value={localPrimary}
              onChange={setLocalPrimary}
              colors={colors}
            />
            <ColorInput
              label="Secondary"
              value={localSecondary}
              onChange={setLocalSecondary}
              colors={colors}
            />
            <ColorInput
              label="Accent"
              value={localAccent}
              onChange={setLocalAccent}
              colors={colors}
            />

            <View style={styles.customButtons}>
              <TouchableOpacity
                style={[styles.applyButton, { backgroundColor: colors.primary }]}
                onPress={handleCustomColorsApply}
                disabled={!isPremium}
              >
                <Text style={styles.applyButtonText}>Apply Custom Colors</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resetButton, { borderColor: colors.border }]}
                onPress={resetToDefault}
              >
                <Text style={[styles.resetButtonText, { color: colors.textSecondary }]}>Reset</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Preview Section */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Preview</Text>

          {/* Gradient Preview */}
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientPreview}
          />

          {/* Button Previews */}
          <View style={styles.buttonPreviews}>
            <View style={[styles.previewButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.previewButtonText}>Primary</Text>
            </View>
            <View style={[styles.previewButton, { backgroundColor: colors.secondary }]}>
              <Text style={styles.previewButtonText}>Secondary</Text>
            </View>
            <View style={[styles.previewButton, { backgroundColor: colors.accent }]}>
              <Text style={styles.previewButtonText}>Accent</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Preset Card Component
function PresetCard({
  preset,
  isSelected,
  isPremium,
  colors,
  onPress,
}: {
  preset: ThemePreset;
  isSelected: boolean;
  isPremium: boolean;
  colors: any;
  onPress: () => void;
}) {
  const isLocked = !preset.is_free && !isPremium;

  return (
    <TouchableOpacity
      style={[
        styles.presetCard,
        { borderColor: isSelected ? colors.primary : colors.border },
        isSelected && { backgroundColor: colors.primary + '10' },
        isLocked && { opacity: 0.6 },
      ]}
      onPress={onPress}
      disabled={isLocked}
    >
      <LinearGradient
        colors={[preset.primary, preset.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.presetGradient}
      />
      <View style={styles.presetInfo}>
        <Text style={[styles.presetName, { color: colors.textPrimary }]} numberOfLines={1}>
          {preset.name}
        </Text>
        {isLocked && <Ionicons name="lock-closed" size={14} color={colors.textTertiary} />}
        {isSelected && <Ionicons name="checkmark-circle" size={14} color={colors.primary} />}
      </View>
    </TouchableOpacity>
  );
}

// Color Input Component
function ColorInput({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  colors: any;
}) {
  return (
    <View style={styles.colorInputContainer}>
      <Text style={[styles.colorLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.colorInputRow}>
        <View style={[styles.colorSwatch, { backgroundColor: value }]} />
        <View style={[styles.colorInput, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <Text style={[styles.colorValue, { color: colors.textPrimary }]}>{value.toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  saveButton: {
    padding: 4,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  premiumBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  modeButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  modeLabel: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  presetCard: {
    width: '47%',
    borderRadius: 12,
    borderWidth: 2,
    padding: 8,
  },
  presetGradient: {
    height: 48,
    borderRadius: 8,
    marginBottom: 8,
  },
  presetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  presetName: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  colorInputContainer: {
    marginBottom: 16,
  },
  colorLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  colorInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  colorInput: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  colorValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  customButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  applyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  resetButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  gradientPreview: {
    height: 64,
    borderRadius: 12,
    marginBottom: 16,
  },
  buttonPreviews: {
    flexDirection: 'row',
    gap: 12,
  },
  previewButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  previewButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
});
