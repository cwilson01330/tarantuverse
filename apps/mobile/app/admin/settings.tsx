import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';

interface SettingEntry {
  key: string;
  value: string;
  value_type: string;
  label: string;
  description: string | null;
  is_sensitive: boolean;
  updated_at: string | null;
}

type SettingsByCategory = Record<string, SettingEntry[]>;

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  maintenance: { label: 'Maintenance', icon: 'wrench' },
  feature_flags: { label: 'Feature Flags', icon: 'flag-variant' },
  platform_limits: { label: 'Platform Limits', icon: 'ruler' },
  notifications: { label: 'Notifications & Email', icon: 'bell-ring' },
};

const CATEGORY_ORDER = ['maintenance', 'feature_flags', 'platform_limits', 'notifications'];

export default function AdminSettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [settings, setSettings] = useState<SettingsByCategory>({});
  const [loading, setLoading] = useState(true);
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.is_superuser && !user?.is_admin) {
      Alert.alert('Access Denied', 'You do not have admin privileges.');
      router.back();
      return;
    }
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await apiClient.get('/admin/settings/');
      setSettings(res.data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load system settings');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setPendingChanges(prev => ({ ...prev, [key]: value }));
  };

  const toggleBool = (key: string, currentRaw: string) => {
    const flipped = currentRaw.toLowerCase() === 'true' ? 'false' : 'true';
    handleChange(key, flipped);
  };

  const getDisplayValue = (key: string, original: string): string => {
    return pendingChanges[key] ?? original;
  };

  const hasPending = Object.keys(pendingChanges).length > 0;

  const saveAll = async () => {
    setSaving(true);
    try {
      const typedUpdates: Record<string, any> = {};
      for (const [key, rawVal] of Object.entries(pendingChanges)) {
        let vtype = 'string';
        for (const entries of Object.values(settings)) {
          const found = entries.find(e => e.key === key);
          if (found) { vtype = found.value_type; break; }
        }
        if (vtype === 'bool') typedUpdates[key] = rawVal.toLowerCase() === 'true';
        else if (vtype === 'int') typedUpdates[key] = parseInt(rawVal, 10);
        else if (vtype === 'float') typedUpdates[key] = parseFloat(rawVal);
        else typedUpdates[key] = rawVal;
      }

      await apiClient.put('/admin/settings/bulk/', { settings: typedUpdates });
      setPendingChanges({});
      Alert.alert('Saved', 'Settings updated successfully');
      fetchSettings();
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>System Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Pending changes bar */}
        {hasPending && (
          <View style={[styles.pendingBar, { backgroundColor: '#fef3c7', borderColor: '#f59e0b' }]}>
            <Text style={{ color: '#92400e', fontWeight: '600', fontSize: 13 }}>
              {Object.keys(pendingChanges).length} unsaved change{Object.keys(pendingChanges).length > 1 ? 's' : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => setPendingChanges({})} style={[styles.barBtn, { borderColor: '#d1d5db' }]}>
                <Text style={{ color: '#374151', fontSize: 12 }}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveAll}
                disabled={saving}
                style={[styles.barBtn, { backgroundColor: '#16a34a', borderColor: '#16a34a' }]}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                  {saving ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Categories */}
        {CATEGORY_ORDER.map(cat => {
          const meta = CATEGORY_META[cat];
          const entries = settings[cat] || [];
          if (!meta || entries.length === 0) return null;

          return (
            <View key={cat} style={styles.section}>
              <View style={[styles.sectionHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <MaterialCommunityIcons name={meta.icon as any} size={20} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{meta.label}</Text>
              </View>

              {entries.map((entry, idx) => {
                const displayVal = getDisplayValue(entry.key, entry.value);
                const isChanged = entry.key in pendingChanges;

                return (
                  <View
                    key={entry.key}
                    style={[
                      styles.settingRow,
                      {
                        backgroundColor: isChanged ? '#fffbeb' : colors.surface,
                        borderBottomColor: colors.border,
                        borderBottomWidth: idx < entries.length - 1 ? StyleSheet.hairlineWidth : 0,
                      },
                    ]}
                  >
                    <View style={styles.settingInfo}>
                      <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                        {entry.label}
                        {isChanged && <Text style={{ color: '#d97706', fontSize: 10 }}> (modified)</Text>}
                      </Text>
                      {entry.description && (
                        <Text style={[styles.settingDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                          {entry.description}
                        </Text>
                      )}
                    </View>

                    <View style={styles.settingControl}>
                      {entry.value_type === 'bool' ? (
                        <Switch
                          value={displayVal.toLowerCase() === 'true'}
                          onValueChange={() => toggleBool(entry.key, displayVal)}
                          trackColor={{ false: '#d1d5db', true: '#86efac' }}
                          thumbColor={displayVal.toLowerCase() === 'true' ? '#16a34a' : '#f4f3f4'}
                        />
                      ) : entry.value_type === 'int' || entry.value_type === 'float' ? (
                        <TextInput
                          value={displayVal}
                          onChangeText={v => handleChange(entry.key, v)}
                          keyboardType="numeric"
                          style={[styles.numberInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
                        />
                      ) : (
                        <TextInput
                          value={displayVal}
                          onChangeText={v => handleChange(entry.key, v)}
                          style={[styles.textInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  pendingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  barBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  section: { marginBottom: 20, borderRadius: 12, overflow: 'hidden' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  settingInfo: { flex: 1, marginRight: 12 },
  settingLabel: { fontSize: 13, fontWeight: '600' },
  settingDesc: { fontSize: 11, marginTop: 2 },
  settingControl: { flexShrink: 0 },
  numberInput: {
    width: 80,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 14,
    textAlign: 'right',
  },
  textInput: {
    width: 160,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 13,
  },
});
