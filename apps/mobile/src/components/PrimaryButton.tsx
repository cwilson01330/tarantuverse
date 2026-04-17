/**
 * PrimaryButton
 *
 * Preset-aware primary action button. In Hobbyist mode it renders a
 * LinearGradient fill; in Keeper mode it renders a flat solid fill using
 * colors.primary. All other props (style, onPress, disabled, children) are
 * forwarded normally.
 *
 * Usage — replace the common pattern:
 *
 *   <TouchableOpacity onPress={fn} style={outerStyle}>
 *     <LinearGradient colors={[colors.primary, colors.secondary]} style={innerStyle}>
 *       <Text>Label</Text>
 *     </LinearGradient>
 *   </TouchableOpacity>
 *
 * with:
 *
 *   <PrimaryButton onPress={fn} outerStyle={outerStyle} style={innerStyle}>
 *     <Text style={styles.buttonText}>Label</Text>
 *   </PrimaryButton>
 *
 * For FABs (circular), pass the `fab` prop and size:
 *
 *   <PrimaryButton fab size={56} onPress={fn} style={styles.fab}>
 *     <MaterialCommunityIcons name="plus" size={28} color="#fff" />
 *   </PrimaryButton>
 *
 * For small icon boxes (stat cards), pass `iconBox` and size:
 *
 *   <PrimaryButton iconBox size={40}>
 *     <Text style={{ fontSize: 20 }}>🕷️</Text>
 *   </PrimaryButton>
 */

import React from 'react';
import {
  TouchableOpacity,
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TouchableOpacityProps,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';

interface PrimaryButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  /** Style applied to the inner gradient/flat fill layer */
  style?: StyleProp<ViewStyle>;
  /** Style applied to the outer TouchableOpacity wrapper */
  outerStyle?: StyleProp<ViewStyle>;
  /** Children rendered inside the button */
  children: React.ReactNode;
  /** Render as a circular FAB — applies circular border radius and centers content */
  fab?: boolean;
  /** Render as a small square icon box (e.g. stat cards) */
  iconBox?: boolean;
  /** Size in px — used for FAB diameter or icon box side length */
  size?: number;
  /** Disable press interaction */
  disabled?: boolean;
}

export function PrimaryButton({
  style,
  outerStyle,
  children,
  fab = false,
  iconBox = false,
  size,
  disabled = false,
  onPress,
  ...rest
}: PrimaryButtonProps) {
  const { colors, layout } = useTheme();

  // Compute shape styles for FAB / icon box variants
  const shapeStyle: ViewStyle =
    fab && size
      ? { width: size, height: size, borderRadius: size / 2, justifyContent: 'center', alignItems: 'center' }
      : iconBox && size
      ? { width: size, height: size, borderRadius: layout.radius.sm, justifyContent: 'center', alignItems: 'center' }
      : {};

  const innerStyle = [shapeStyle, style];

  const fill = layout.useGradient ? (
    <LinearGradient
      colors={[colors.primary, colors.secondary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={innerStyle}
    >
      {children}
    </LinearGradient>
  ) : (
    <View style={[innerStyle, { backgroundColor: colors.primary }]}>
      {children}
    </View>
  );

  // iconBox and non-interactive uses don't need a TouchableOpacity wrapper
  if (iconBox || !onPress) {
    return <>{fill}</>;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[disabled && styles.disabled, outerStyle]}
      {...rest}
    >
      {fill}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.5,
  },
});
