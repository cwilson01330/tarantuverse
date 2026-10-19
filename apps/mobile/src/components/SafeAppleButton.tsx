/**
 * Sign in with Apple button that can't take the screen down.
 *
 * Renders Apple's official native button (Guideline 4.8 / HIG). That button is
 * a native VIEW, and a binary can have expo-apple-authentication's functions
 * linked while its view manager is not registered — rendering it then throws
 * "View config getter callback for component ViewManagerAdapter_
 * ExpoAppleAuthentication… must be a function" and kills the whole screen
 * (hit on HV build 16 and the HV App Store build, 2026-10-18).
 *
 * So the native button sits inside a local error boundary. If it can't render,
 * we fall back to a plain button drawn to Apple's guidelines (black or white,
 * Apple logo, "Continue with Apple" / "Sign up with Apple") that calls the same
 * handler — sign-in itself only needs the module's functions, which work.
 */
import React from 'react';
import { StyleProp, Text, TouchableOpacity, ViewStyle, StyleSheet } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TYPE } from '../theme/tokens';

type Props = {
  kind?: 'continue' | 'signup';
  variant?: 'white' | 'black';
  cornerRadius?: number;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
};

type BoundaryState = { failed: boolean };

class NativeButtonBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  BoundaryState
> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[SafeAppleButton] native Apple button unavailable; using fallback', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function SafeAppleButton({
  kind = 'continue',
  variant = 'white',
  cornerRadius = 8,
  style,
  onPress,
}: Props) {
  const isWhite = variant === 'white';
  const fg = isWhite ? 'black' : 'white';
  const label = kind === 'signup' ? 'Sign up with Apple' : 'Continue with Apple';

  const fallback = (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.fallback,
        {
          backgroundColor: isWhite ? 'white' : 'black',
          borderColor: 'black',
          borderRadius: cornerRadius,
        },
        style,
      ]}
    >
      <MaterialCommunityIcons name="apple" size={20} color={fg} />
      <Text style={[styles.fallbackText, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <NativeButtonBoundary fallback={fallback}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={
          kind === 'signup'
            ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
            : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
        }
        buttonStyle={
          isWhite
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={cornerRadius}
        style={style}
        onPress={onPress}
      />
    </NativeButtonBoundary>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    minHeight: 44,
  },
  fallbackText: { ...TYPE.subheading },
});
