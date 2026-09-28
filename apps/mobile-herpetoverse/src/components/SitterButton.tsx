/**
 * Button used across the sitter-pass screens. Theme tokens only.
 * `danger` is for End now; `secondary` for everything that isn't the main action.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/type';

export default function SitterButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
}) {
  const { colors, layout } = useTheme();
  const bg = variant === 'primary' ? colors.primary : 'transparent';
  // HV primary is a bright green: dark text, as on every HV primary button.
  const fg = variant === 'primary' ? '#0B0B0B' : variant === 'danger' ? colors.danger : colors.textPrimary;
  const border = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : colors.border;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={[
        styles.btn,
        { backgroundColor: bg, borderColor: border, borderRadius: layout.radius.md, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[TYPE.bodyStrong, { color: fg }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { borderWidth: 1, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', minHeight: 44 },
});
