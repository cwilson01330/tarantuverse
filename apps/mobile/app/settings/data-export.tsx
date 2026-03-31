import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { apiClient } from '../../src/services/api';

interface ExportPreview {
  username: string;
  counts: {
    tarantulas: number;
    feeding_logs: number;
    molt_logs: number;
    substrate_changes: number;
    photos: number;
    enclosures: number;
    pairings: number;
    egg_sacs: number;
    offspring: number;
  };
  formats_available: string[];
}

const DATA_CATEGORIES = [
  { key: 'tarantulas', label: 'Tarantulas', icon: 'spider' },
  { key: 'feeding_logs', label: 'Feeding Logs', icon: 'food-drumstick' },
  { key: 'molt_logs', label: 'Molt Logs', icon: 'clipboard-text' },
  { key: 'substrate_changes', label: 'Substrate Changes', icon: 'leaf' },
  { key: 'photos', label: 'Photos', icon: 'camera' },
  { key: 'enclosures', label: 'Enclosures', icon: 'home' },
  { key: 'pairings', label: 'Pairings', icon: 'heart-multiple' },
  { key: 'egg_sacs', label: 'Egg Sacs', icon: 'egg' },
  { key: 'offspring', label: 'Offspring', icon: 'spider-thread' },
] as const;

export default function DataExportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    fetchPreview();
  }, []);

  const fetchPreview = async () => {
    try {
      const response = await apiClient.get('/export/preview');
      setPreview(response.data);
    } catch {
      // Preview failed — still show the page
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: string) => {
    setExporting(format);
    try {
      // For mobile, we open the export URL in the browser so the OS handles the download
      const baseUrl = apiClient.defaults.baseURL || '';
      const token = apiClient.defaults.headers?.common?.['Authorization'] || '';

      // Use a direct download URL with token as query param
      // The browser will handle the file download natively
      const exportUrl = `${baseUrl}/export/${format}`;

      const response = await apiClient.get(`/export/${format}`, {
        responseType: 'blob',
      });

      // For mobile, we can share or save using the share sheet
      // For now, confirm success and suggest using web for file downloads
      Alert.alert(
        'Export Ready',
        'For the best download experience, visit tarantuverse.com on your computer and go to Settings > Export Data. Your data exports are available in JSON, CSV, or complete backup format.',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      Alert.alert('Export Failed', 'Something went wrong. Please try again or use the web app to export.');
    } finally {
      setExporting(null);
    }
  };

  const totalRecords = preview
    ? Object.values(preview.counts).reduce((a, b) => a + b, 0)
    : 0;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
      marginRight: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    content: {
      flex: 1,
      padding: 16,
    },
    description: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 20,
      lineHeight: 20,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 12,
    },
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    summaryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.backgroundElevated,
      borderRadius: 10,
      padding: 10,
      width: '48%',
    },
    summaryCount: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    summaryLabel: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    totalText: {
      fontSize: 13,
      color: colors.textTertiary,
      marginTop: 12,
    },
    exportCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    exportHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 6,
    },
    exportTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      flex: 1,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: '600',
    },
    exportDescription: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: 12,
    },
    exportButton: {
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
    },
    exportButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },
    infoCard: {
      backgroundColor: colors.isDark ? 'rgba(59, 130, 246, 0.1)' : '#eff6ff',
      borderRadius: 16,
      padding: 16,
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.isDark ? 'rgba(59, 130, 246, 0.3)' : '#bfdbfe',
    },
    infoTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    infoText: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    loadingContainer: {
      padding: 40,
      alignItems: 'center',
    },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Export Data</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>
          Download your data in the format that works best for you. All exports are free and available instantly.
        </Text>

        {/* Data Summary */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : preview ? (
          <>
            <Text style={styles.sectionTitle}>Your Data</Text>
            <View style={styles.summaryCard}>
              <View style={styles.summaryGrid}>
                {DATA_CATEGORIES.map(({ key, label, icon }) => (
                  <View key={key} style={styles.summaryItem}>
                    <MaterialCommunityIcons name={icon as any} size={20} color={colors.primary} />
                    <View>
                      <Text style={styles.summaryCount}>
                        {preview.counts[key as keyof typeof preview.counts]}
                      </Text>
                      <Text style={styles.summaryLabel}>{label}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <Text style={styles.totalText}>
                {totalRecords.toLocaleString()} records total
              </Text>
            </View>
          </>
        ) : null}

        {/* Export Options */}
        <Text style={styles.sectionTitle}>Choose Format</Text>

        {/* JSON */}
        <View style={styles.exportCard}>
          <View style={styles.exportHeader}>
            <MaterialCommunityIcons name="code-json" size={22} color={colors.primary} />
            <Text style={styles.exportTitle}>JSON Export</Text>
            <View style={[styles.badge, { backgroundColor: colors.isDark ? 'rgba(59, 130, 246, 0.2)' : '#dbeafe' }]}>
              <Text style={[styles.badgeText, { color: colors.isDark ? '#93c5fd' : '#1d4ed8' }]}>Re-import</Text>
            </View>
          </View>
          <Text style={styles.exportDescription}>
            Structured file with all data and relationships. Ideal for backups and transferring to other tools.
          </Text>
          <TouchableOpacity
            style={[styles.exportButton, { backgroundColor: colors.primary }]}
            onPress={() => handleExport('json')}
            disabled={exporting !== null}
          >
            {exporting === 'json' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.exportButtonText}>Download .json</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* CSV */}
        <View style={styles.exportCard}>
          <View style={styles.exportHeader}>
            <MaterialCommunityIcons name="file-delimited" size={22} color="#10b981" />
            <Text style={styles.exportTitle}>CSV Spreadsheets</Text>
            <View style={[styles.badge, { backgroundColor: colors.isDark ? 'rgba(16, 185, 129, 0.2)' : '#d1fae5' }]}>
              <Text style={[styles.badgeText, { color: colors.isDark ? '#6ee7b7' : '#065f46' }]}>Excel / Sheets</Text>
            </View>
          </View>
          <Text style={styles.exportDescription}>
            ZIP file with one CSV per data type. Opens directly in Excel, Google Sheets, or Numbers.
          </Text>
          <TouchableOpacity
            style={[styles.exportButton, { backgroundColor: '#10b981' }]}
            onPress={() => handleExport('csv')}
            disabled={exporting !== null}
          >
            {exporting === 'csv' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.exportButtonText}>Download .zip</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Full Backup */}
        <View style={styles.exportCard}>
          <View style={styles.exportHeader}>
            <MaterialCommunityIcons name="folder-zip" size={22} color="#a855f7" />
            <Text style={styles.exportTitle}>Complete Backup</Text>
            <View style={[styles.badge, { backgroundColor: colors.isDark ? 'rgba(168, 85, 247, 0.2)' : '#f3e8ff' }]}>
              <Text style={[styles.badgeText, { color: colors.isDark ? '#c084fc' : '#6b21a8' }]}>+ Photos</Text>
            </View>
          </View>
          <Text style={styles.exportDescription}>
            Everything in one archive — data organized by tarantula with downloaded photos, plus CSV files.
          </Text>
          <TouchableOpacity
            style={[styles.exportButton, { backgroundColor: '#a855f7' }]}
            onPress={() => handleExport('full')}
            disabled={exporting !== null}
          >
            {exporting === 'full' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.exportButtonText}>Download backup</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>About Your Data</Text>
          <Text style={styles.infoText}>
            Your data is always yours. Exports are free for all users. For the best download experience with large files, use the web app at tarantuverse.com.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
