/**
 * Shared form primitives for Bundle 4 log-entry screens.
 *
 * Mobile-friendly versions of the web form fields — the visual language
 * matches the dark Herpetoverse aesthetic but the inputs are sized for
 * thumbs (TextInput height matches button height; chips get 44pt tap
 * targets even though they look smaller).
 *
 * Date entry uses a plain `YYYY-MM-DD` text input rather than a native
 * picker. The native pickers on RN are platform-divergent (DateTimePicker
 * is iOS-modal vs Android-spinner) and have a heavy install footprint;
 * for v1 the text input is consistent and sufficient. We can swap to
 * `@react-native-community/datetimepicker` in a later sprint without
 * touching call sites by keeping the same string-in/string-out contract.
 */
import { ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

// ---------------------------------------------------------------------------
// Error banner — used at the bottom of forms when a submit fails.
// ---------------------------------------------------------------------------

export function FormErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner} accessibilityLiveRegion="polite">
      <Text style={styles.errorBannerText}>{message}</Text>
    </View>
  );
}

/**
 * Pull a human-readable message out of an axios error. FastAPI returns
 * `{ detail: string | { msg: string }[] }`. Falls back to err.message
 * (network errors) and finally to the supplied fallback.
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const e = err as {
      response?: { data?: { detail?: unknown } };
      message?: string;
    };
    const detail = e.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
    if (e.message) return e.message;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Field wrapper — label + child + optional hint/error.
// ---------------------------------------------------------------------------

export function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textTertiary }]}>
        {label.toUpperCase()}
        {required && (
          <Text style={{ color: colors.danger }}> *</Text>
        )}
      </Text>
      {children}
      {(error || hint) && (
        <Text
          style={[
            styles.fieldHint,
            { color: error ? colors.danger : colors.textTertiary },
          ]}
        >
          {error || hint}
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Themed text input — placeholder, focus border, dark backdrop.
// ---------------------------------------------------------------------------

export function ThemedInput(props: TextInputProps) {
  const { colors, layout } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.textTertiary}
      {...props}
      style={[
        styles.input,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          color: colors.textPrimary,
          borderRadius: layout.radius.md,
        },
        props.style,
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Chip group — single-select option row. Used for sex, feeding outcome,
// taxon picker, weight context, etc.
// ---------------------------------------------------------------------------

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors, layout } = useTheme();
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.primary : colors.background,
                borderColor: selected ? colors.primary : colors.border,
                borderRadius: layout.radius.sm,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={opt.label}
          >
            <Text
              style={[
                styles.chipLabel,
                { color: selected ? '#0B0B0B' : colors.textSecondary },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Submit button — disables while in flight, shows label when busy.
// ---------------------------------------------------------------------------

export function SubmitButton({
  label,
  busy,
  onPress,
  disabled,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors, layout } = useTheme();
  const muted = busy || disabled;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={muted}
      style={[
        styles.submit,
        {
          backgroundColor: muted ? colors.surfaceRaised : colors.primary,
          borderRadius: layout.radius.md,
          opacity: muted ? 0.7 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: muted, busy }}
    >
      <Text
        style={[
          styles.submitText,
          { color: muted ? colors.textSecondary : '#0B0B0B' },
        ]}
      >
        {busy ? 'Saving…' : label}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** YYYY-MM-DD in the user's local TZ — the date picker default. */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse a YYYY-MM-DD text input back into an ISO datetime in local time.
 * The backend stores `*_at` as datetimes; passing the noon time keeps the
 * date stable across DST flips and TZ rounding.
 */
export function dateToISO(date: string): string | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  // Construct in local time, then serialize as ISO. Noon avoids the
  // "logged at midnight, UTC pushes it to yesterday" bug class.
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  fieldHint: {
    fontSize: 12,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 44,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    minHeight: 44,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  submit: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitText: {
    fontSize: 15,
    fontWeight: '700',
  },
  errorBanner: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.4)',
  },
  errorBannerText: {
    color: '#fb7185',
    fontSize: 13,
    lineHeight: 18,
  },
});
