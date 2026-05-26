/**
 * Forgot password — Herpetoverse mobile.
 *
 * Sends the reset email and tells the keeper to check their inbox.
 * The actual reset happens on the web — the email link points to
 * `herpetoverse.com/reset-password?token=…` because we pass
 * `frontend_url` in the request, which the backend allowlists so HV's
 * own host is used instead of the default Tarantuverse host.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/contexts/ThemeContext';
import { apiClient } from '../src/services/api';

// Apex host — the backend allowlist accepts this for the reset link.
const HV_WEB_ORIGIN = 'https://herpetoverse.com';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Email required', 'Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', {
        email: trimmed,
        frontend_url: HV_WEB_ORIGIN,
      });
      Alert.alert(
        'Check your email',
        'If an account exists for that email, a password reset link is on its way. The link expires in 24 hours.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err: any) {
      Alert.alert(
        'Could not send reset email',
        err?.response?.data?.detail || 'Please try again in a moment.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Reset your password
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Enter your email and we&apos;ll send a link to reset your password.
        </Text>

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              color: colors.textPrimary,
              borderRadius: layout.radius.md,
            },
          ]}
          placeholder="you@example.com"
          placeholderTextColor={colors.textTertiary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!loading}
        />

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading}
          style={[
            styles.button,
            {
              backgroundColor: loading ? colors.surfaceRaised : colors.primary,
              borderRadius: layout.radius.md,
              opacity: loading ? 0.7 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading, busy: loading }}
          accessibilityLabel="Send reset link"
        >
          {loading ? (
            <ActivityIndicator color={colors.textSecondary} />
          ) : (
            <Text style={styles.buttonText}>Send reset link</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.back()}
          disabled={loading}
          style={styles.backLink}
          accessibilityRole="button"
          accessibilityLabel="Back to sign in"
        >
          <Text style={[styles.backLinkText, { color: colors.textSecondary }]}>
            Back to sign in
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 28,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
    marginBottom: 16,
  },
  button: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: {
    color: '#0B0B0B',
    fontSize: 15,
    fontWeight: '700',
  },
  backLink: {
    marginTop: 18,
    alignItems: 'center',
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
