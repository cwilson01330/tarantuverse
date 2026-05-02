/**
 * HeaderBackButton — chevron-left button that pops the navigation stack.
 *
 * Default behavior is `router.back()`. Pass an `onPress` to override (e.g.
 * to confirm before discarding form changes, or to push to a specific
 * route instead of popping).
 *
 * The button uses the theme's primary color and a 44pt hit target — the
 * minimum touch size Apple recommends.
 */

import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';

interface HeaderBackButtonProps {
  onPress?: () => void;
  /** Override the default chevron icon name. */
  iconName?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Override the default accessibility label. */
  accessibilityLabel?: string;
}

export function HeaderBackButton({
  onPress,
  iconName = 'chevron-left',
  accessibilityLabel = 'Go back',
}: HeaderBackButtonProps) {
  const router = useRouter();
  const { colors } = useTheme();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (router.canGoBack()) {
      router.back();
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      hitSlop={8}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <MaterialCommunityIcons name={iconName} size={28} color={colors.primary} />
    </TouchableOpacity>
  );
}

export default HeaderBackButton;

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 36,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
});
