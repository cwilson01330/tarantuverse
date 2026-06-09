/**
 * Whip spider species picker — debounced autocomplete used by the
 * add/edit forms. Mirrors CentipedeSpeciesPicker, but whip spiders are
 * harmless (no venom), so the result row shows a CARE-LEVEL pill instead
 * of a venom-severity pill — showing "Unknown venom" for an animal with
 * no venom would be misleading.
 *
 * Reuses the catalog API from src/lib/whip-spiders.ts. Free-typing a name
 * still works — onChange(null) fires so the parent keeps the typed
 * scientific_name on the record.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useTheme } from '../contexts/ThemeContext';
import {
  searchWhipSpiderSpecies,
  type WhipSpiderSpecies,
  type CareLevel,
  CARE_LEVEL_LABELS,
} from '../lib/whip-spiders';

interface Props {
  /** ID of the currently-selected species, or null when free-typing. */
  valueId: string | null;
  /** Current scientific-name string (selected or free-typed). */
  valueScientific: string;
  /** Fires when the keeper picks a species or clears it. */
  onChange: (picked: WhipSpiderSpecies | null) => void;
  placeholder?: string;
}

const DEBOUNCE_MS = 250;

function careLevelColor(
  level: CareLevel | null | undefined,
): { bg: string; fg: string; label: string } {
  switch (level) {
    case 'beginner':
      return { bg: '#dcfce7', fg: '#166534', label: 'Beginner' };
    case 'intermediate':
      return { bg: '#fef3c7', fg: '#92400e', label: 'Intermediate' };
    case 'advanced':
      return { bg: '#fee2e2', fg: '#991b1b', label: 'Advanced' };
    default:
      return { bg: '#e5e7eb', fg: '#374151', label: 'Care level —' };
  }
}

export function WhipSpiderSpeciesPicker({
  valueId,
  valueScientific,
  onChange,
  placeholder = 'Search species…',
}: Props) {
  const { colors } = useTheme();
  const [query, setQuery] = useState(valueScientific);
  const [results, setResults] = useState<WhipSpiderSpecies[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync internal query when parent updates valueScientific (edit-mode load).
  useEffect(() => {
    if (!open) setQuery(valueScientific);
  }, [valueScientific, open]);

  const handleChangeText = (text: string) => {
    setQuery(text);
    setOpen(true);
    // Clear the selected ID — editing the text after picking a species
    // means the FK no longer matches the typed name.
    if (valueId) onChange(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const rows = await searchWhipSpiderSpecies(text.trim(), 8);
        setResults(rows);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  };

  const handlePick = (row: WhipSpiderSpecies) => {
    onChange(row);
    setQuery(row.scientific_name);
    setOpen(false);
    setResults([]);
  };

  const styles = makeStyles(colors);

  return (
    <View style={{ position: 'relative' }}>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={handleChangeText}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {open && (loading || results.length > 0) && (
        <View style={styles.dropdown}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.loadingText}>Searching…</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(r) => r.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const care = careLevelColor(item.care_level);
                return (
                  <TouchableOpacity
                    style={styles.resultRow}
                    onPress={() => handlePick(item)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName}>
                        {item.scientific_name}
                      </Text>
                      {item.common_names?.[0] && (
                        <Text style={styles.resultCommon}>
                          {item.common_names[0]}
                        </Text>
                      )}
                    </View>
                    <View
                      style={[styles.carePill, { backgroundColor: care.bg }]}
                    >
                      <Text style={[styles.carePillText, { color: care.fg }]}>
                        {item.care_level
                          ? CARE_LEVEL_LABELS[item.care_level]
                          : care.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    dropdown: {
      position: 'absolute',
      top: 48,
      left: 0,
      right: 0,
      maxHeight: 240,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
      zIndex: 10,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
    },
    loadingText: { color: colors.textTertiary, fontSize: 13 },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    resultName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      fontStyle: 'italic',
    },
    resultCommon: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    carePill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
    },
    carePillText: {
      fontSize: 11,
      fontWeight: '600',
    },
  });
