/**
 * Reptile species autocomplete — mobile.
 *
 * Two-piece state out (matches web component):
 *   - speciesId  → reptile_species_id on the animal record (links care
 *                  sheet + prey suggestion)
 *   - scientificName → cached on the animal record so list/detail views
 *                       don't need a species round-trip
 *
 * Dropdown is rendered inline (below the input) rather than as a Modal
 * because forms scroll vertically — a modal would feel like an overlay
 * for what's really an inline pick. ScrollView handles overflow if the
 * 8 results don't fit on screen.
 *
 * Falls back to free text gracefully — if the keeper's species isn't
 * in our library yet, they can still type anything and save. The form
 * will record `scientific_name` without a `reptile_species_id`, and
 * prey-suggestion + care-sheet links will show "no species linked"
 * states until they pick one later.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedInput } from './FormPrimitives';
import {
  CARE_LEVEL_LABELS,
  type ReptileSpeciesSearchResult,
  searchReptileSpecies,
} from '../../lib/reptile-species';

const DEBOUNCE_MS = 300;

export interface ReptileSpeciesAutocompleteProps {
  speciesId: string | null;
  scientificName: string;
  onChange: (value: { id: string | null; scientificName: string }) => void;
  /**
   * Fired when the user picks a species from the dropdown. Parent uses
   * this to auto-fill the common_name field.
   */
  onPick?: (species: ReptileSpeciesSearchResult) => void;
  placeholder?: string;
}

export function ReptileSpeciesAutocomplete({
  speciesId,
  scientificName,
  onChange,
  onPick,
  placeholder = 'Python regius',
}: ReptileSpeciesAutocompleteProps) {
  const { colors, layout } = useTheme();

  const [query, setQuery] = useState(scientificName);
  const [results, setResults] = useState<ReptileSpeciesSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Track whether the user is mid-type vs. just got the field set from
  // outside (e.g. EditReptileScreen pre-fill). We don't want to fire a
  // search the moment a screen mounts.
  const userTyped = useRef(false);

  // Sync external scientificName changes (pre-fill).
  useEffect(() => {
    if (!userTyped.current) {
      setQuery(scientificName);
    }
  }, [scientificName]);

  // Debounced search.
  useEffect(() => {
    if (!userTyped.current) {
      setResults([]);
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const data = await searchReptileSpecies(trimmed, 8);
        setResults(data);
      } catch {
        // Network errors during typing are noisy; swallow + keep last
        // results. The form save path surfaces real errors.
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  function handleInput(next: string) {
    userTyped.current = true;
    setQuery(next);
    setOpen(true);
    // Once the user edits, the prior selection is stale.
    onChange({ id: null, scientificName: next });
  }

  function pick(species: ReptileSpeciesSearchResult) {
    setQuery(species.scientific_name);
    setOpen(false);
    setResults([]);
    onChange({
      id: species.id,
      scientificName: species.scientific_name,
    });
    onPick?.(species);
  }

  const showDropdown =
    open && (loading || results.length > 0) && query.trim().length >= 2;

  const linkedToCareSheet =
    !!speciesId && query.trim() === scientificName.trim();

  return (
    <View>
      <ThemedInput
        value={query}
        onChangeText={handleInput}
        onFocus={() => setOpen(true)}
        // No onBlur close — RN doesn't have stable mousedown ordering
        // like the web. Tapping a result intentionally blurs the input
        // first, which would close the dropdown before pick fires. We
        // close on selection or via the Done button instead.
        placeholder={placeholder}
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
      />

      {linkedToCareSheet && (
        <View style={styles.linkedRow}>
          <MaterialCommunityIcons
            name="check-circle-outline"
            size={14}
            color={colors.primary}
          />
          <Text style={[styles.linkedText, { color: colors.primary }]}>
            Linked to care sheet — prey suggestions will use this species.
          </Text>
        </View>
      )}

      {!speciesId &&
        query.trim().length >= 2 &&
        !loading &&
        results.length === 0 &&
        userTyped.current && (
          <Text style={[styles.noMatch, { color: colors.textTertiary }]}>
            No match in our library. You can still save — prey suggestions
            will be disabled until a matching species is picked.
          </Text>
        )}

      {showDropdown && (
        <View
          style={[
            styles.dropdown,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: layout.radius.md,
            },
          ]}
        >
          <View style={styles.dropdownHeader}>
            <Text
              style={[styles.dropdownHeaderText, { color: colors.textTertiary }]}
            >
              {loading ? 'SEARCHING…' : `${results.length} MATCH${results.length === 1 ? '' : 'ES'}`}
            </Text>
            <TouchableOpacity
              onPress={() => setOpen(false)}
              style={styles.dropdownDone}
              accessibilityRole="button"
              accessibilityLabel="Close suggestions"
            >
              <Text style={[styles.dropdownDoneText, { color: colors.primary }]}>
                Done
              </Text>
            </TouchableOpacity>
          </View>

          {loading && results.length === 0 && (
            <View style={styles.dropdownLoading}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          )}

          {results.map((s, idx) => {
            const common = s.common_names[0];
            return (
              <TouchableOpacity
                key={s.id}
                onPress={() => pick(s)}
                style={[
                  styles.dropdownRow,
                  {
                    borderBottomColor: colors.border,
                    borderBottomWidth: idx < results.length - 1 ? 1 : 0,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Pick ${s.scientific_name}`}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[styles.rowSci, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {s.scientific_name}
                  </Text>
                  {common && (
                    <Text
                      style={[styles.rowCommon, { color: colors.textTertiary }]}
                      numberOfLines={1}
                    >
                      {common}
                    </Text>
                  )}
                </View>
                {s.care_level && (
                  <Text
                    style={[
                      styles.rowBadge,
                      {
                        color: colors.textSecondary,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {CARE_LEVEL_LABELS[s.care_level]}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  linkedText: {
    fontSize: 11,
    fontWeight: '600',
  },
  noMatch: {
    marginTop: 6,
    fontSize: 11,
    fontStyle: 'italic',
  },

  dropdown: {
    marginTop: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  dropdownHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dropdownDone: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dropdownDoneText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownLoading: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowSci: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  rowCommon: {
    fontSize: 12,
    marginTop: 2,
  },
  rowBadge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    textTransform: 'uppercase',
  },
});
