/**
 * Email + password registration.
 *
 * Posts to `/auth/register` which returns a message rather than a token —
 * the backend currently requires email verification before first login
 * (feature flag can disable this in future). We show the "check your
 * email" state on success rather than trying to auto-sign-in.
 */
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { captureEvent } from '../src/services/posthog';

export default function RegisterScreen() {
  const router = useRouter();
  const { register, login } = useAuth();
  const { colors, layout } = useTheme();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await register(email.trim(), username.trim(), password);
      captureEvent('signup_success');
      if (result.requires_email_verification) {
        setVerificationMessage(result.message);
      } else {
        // Auto-sign-in if email verification is off (feature flag).
        await login(email.trim(), password);
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      captureEvent('signup_failed');
      setError(err.message || 'Could not create account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={[styles.brand, { color: colors.primary }]}>Herpetoverse</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Start tracking your reptiles.
            </Text>
          </View>

          {verificationMessage ? (
            <View
              style={[
                styles.verifyBox,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: layout.radius.lg,
                },
              ]}
            >
              <Text style={[styles.verifyTitle, { color: colors.textPrimary }]}>
                Check your email
              </Text>
              <Text style={[styles.verifyBody, { color: colors.textSecondary }]}>
                {verificationMessage}
              </Text>
              <Link href="/login" asChild>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    {
                      backgroundColor: colors.primary,
                      borderRadius: layout.radius.md,
                      marginTop: 20,
                    },
                  ]}
                >
                  <Text style={styles.primaryButtonText}>Back to sign in</Text>
                </TouchableOpacity>
              </Link>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholder="you@example.com"
                placeholderTextColor={colors.textTertiary}
                style={inputStyle(colors, layout)}
                editable={!submitting}
              />

              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>
                Username
              </Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoComplete="username-new"
                placeholder="reptile_keeper"
                placeholderTextColor={colors.textTertiary}
                style={inputStyle(colors, layout)}
                editable={!submitting}
              />

              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>
                Password
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password-new"
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textTertiary}
                style={inputStyle(colors, layout)}
                editable={!submitting}
              />

              {error && (
                <View
                  style={[
                    styles.errorBox,
                    {
                      backgroundColor: `${colors.danger}22`,
                      borderColor: colors.danger,
                      borderRadius: layout.radius.md,
                    },
                  ]}
                >
                  <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={submitting || !email || !username || !password}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor:
                      submitting || !email || !username || !password
                        ? colors.surfaceRaised
                        : colors.primary,
                    borderRadius: layout.radius.md,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Create account"
              >
                {submitting ? (
                  <ActivityIndicator color="#0B0B0B" />
                ) : (
                  <Text style={styles.primaryButtonText}>Create account</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textTertiary }]}>
              Already have an account?
            </Text>
            <Link href="/login" asChild>
              <TouchableOpacity>
                <Text style={[styles.footerLink, { color: colors.primary }]}>Sign in</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function inputStyle(
  colors: ReturnType<typeof useTheme>['colors'],
  layout: ReturnType<typeof useTheme>['layout'],
) {
  return {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    color: colors.textPrimary,
    borderRadius: layout.radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  } as const;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboardWrap: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 36 },
  brand: { fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { fontSize: 16, marginTop: 8 },
  form: { gap: 4 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  errorBox: {
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
  },
  errorText: { fontSize: 14 },
  primaryButton: {
    marginTop: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#0B0B0B',
    fontSize: 16,
    fontWeight: '700',
  },
  verifyBox: {
    padding: 20,
    borderWidth: 1,
  },
  verifyTitle: { fontSize: 18, fontWeight: '700' },
  verifyBody: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  footer: {
    marginTop: 32,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  footerText: { fontSize: 14 },
  footerLink: { fontSize: 14, fontWeight: '600' },
});
