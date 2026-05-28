/**
 * Centipede species picker — debounced autocomplete used by the
 * add/edit forms.
 *
 * Reuses the catalog API from src/lib/centipedes.ts. The result list
 * appears below the input as a dropdown; tapping a row commits via
 * `onChange` and dismisses the dropdown. Free-typing a name still
 * works — `onChange(null)` fires with whatever text was typed so the
 * parent can keep the typed scientific_name on the record.
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
  searchCentipedeSpecies,
  type CentipedeSpecies,
  VENOM_SEVERITY_LABELS,
  venomSeverityColor,
} from '../lib/centipedes';

interface Props {
  /** ID of the currently-selected species, or null when free-typing. */
  valueId: string | null;
  /** Current scientific-name string (selected or free-typed). */
  valueScientific: string;
  /** Fires when the keeper picks a species or clears it. */
  onChange: (picked: CentipedeSpecies | null) => void;
  placeholder?: string;
}

const DEBOUNCE_MS = 250;

export function CentipedeSpeciesPicker({
  valueId,
  valueScientific,
  onChange,
  placeholder = 'Search species…',
}: Props) {
  const { colors } = useTheme();
  const [query, setQuery] = useState(valueScientific);
  const [results, setResults] = useState<CentipedeSpecies[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync internal query when parent updates valueScientific (e.g. on
  // edit-mode initial load).
  useEffect(() => {
    if (!open) setQuery(valueScientific);
  }, [valueScientific, open]);

  const handleChangeText = (text: string) => {
    setQuery(text);
    setOpen(true);
    // Clear the selected ID — if the user is editing the text after
    // having picked a species, the FK no longer matches the typed name.
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
        const rows = await searchCentipedeSpecies(text.trim(), 8);
        setResults(rows);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  };

  const handlePick = (row: CentipedeSpecies) => {
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
                const venom = venomSeverityColor(item.venom_severity);
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
                      style={[
                        styles.venomPill,
                        { backgroundColor: venom.bg },
                      ]}
                    >
                      <Text style={[styles.venomPillText, { color: venom.fg }]}>
                        {VENOM_SEVERITY_LABELS[item.venom_severity]}
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
    venomPill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
    },
    venomPillText: {
      fontSize: 11,
      fontWeight: '600',
    },
  });
