/**
 * Email + password registration.
 *
 * Posts to `/auth/register` which returns a message rather than a token —
 * the backend currently requires email verification before first login
 * (feature flag can disable this in future). We show the "check your
 * email" state on success rather than trying to auto-sign-in.
 */
import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import GoogleLogo from '../src/components/GoogleLogo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { captureEvent } from '../src/services/posthog';
import { warmupApi, useColdStartIndicator } from '../src/utils/cold-start';
import {
  isGoogleSignInAvailable,
  isAppleSignInAvailable,
} from '../src/services/google-signin';

export default function RegisterScreen() {
  const router = useRouter();
  const { register, login, loginWithGoogle, loginWithApple } = useAuth();
  const { colors, layout } = useTheme();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Guideline 1.2 — must be ticked before the account can be created.
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Warm the Render container while the user fills the form so the
  // submit hits a hot worker.
  useEffect(() => {
    warmupApi();
    isAppleSignInAvailable().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const showColdStartHint = useColdStartIndicator(submitting, 3000);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);

    // Mirror the server's rules (schemas/user.py) so a keeper learns what's
    // wrong before a request is made. Without this the only feedback was a 422,
    // and until today that rendered as "[object Object]" — which told them
    // nothing and made signup impossible unless they guessed the rules.
    const problems: string[] = [];
    if (password.length < 8) problems.push('be at least 8 characters');
    if (!/[A-Z]/.test(password)) problems.push('include a capital letter');
    if (!/[a-z]/.test(password)) problems.push('include a lowercase letter');
    if (!/\d/.test(password)) problems.push('include a number');
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
      problems.push('include a symbol, like ! ? # or $');
    }
    if (problems.length) {
      setError(`Your password needs to ${problems.join(', and ')}.`);
      return;
    }

    setSubmitting(true);
    try {
      const result = await register(email.trim(), username.trim(), password);
      captureEvent('signup_success');
      if (result.requires_email_verification) {
        setVerificationMessage(result.message);
      } else {
        // Auto-sign-in if email verification is off (feature flag).
        await login(email.trim(), password);
        router.replace('/(tabs)/dashboard');
      }
    } catch (err: any) {
      captureEvent('signup_failed');
      setError(err.message || 'Could not create account.');
    } finally {
      setSubmitting(false);
    }
  }

  // OAuth signs the keeper straight in (no email-verification step — the
  // provider already verified the email), then lands them on the dashboard.
  async function handleOAuth(provider: 'google' | 'apple') {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (provider === 'google') {
        await loginWithGoogle();
      } else {
        await loginWithApple();
      }
      captureEvent('signup_success', { method: provider });
      router.replace('/(tabs)/dashboard');
    } catch (err: any) {
      const msg = err?.message || '';
      if (!/cancel/i.test(msg)) {
        captureEvent('signup_failed', { method: provider });
        setError(msg || 'Could not sign in.');
      }
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

              {/* Explicit agreement before account creation. Apple expects
                  apps carrying user-submitted content (species submissions,
                  public keeper profiles) to surface terms and a zero-tolerance
                  statement at sign-up — Guideline 1.2. Mirrors Tarantuverse,
                  which links to an in-app /terms screen; HV has no such screen
                  yet, so these open the hosted pages. */}
              <TouchableOpacity
                onPress={() => setAgreedToTerms((v) => !v)}
                disabled={submitting}
                style={styles.termsRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreedToTerms }}
                accessibilityLabel="Agree to the Terms of Use and Privacy Policy"
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: agreedToTerms ? colors.primary : colors.border,
                      backgroundColor: agreedToTerms ? colors.primary : 'transparent',
                    },
                  ]}
                >
                  {agreedToTerms && (
                    <MaterialCommunityIcons name="check" size={14} color="#0B0B0B" />
                  )}
                </View>
                <Text style={[styles.termsText, { color: colors.textSecondary }]}>
                  I agree to the{' '}
                  <Text
                    style={[styles.termsLink, { color: colors.primary }]}
                    onPress={() => Linking.openURL('https://herpetoverse.com/terms')}
                  >
                    Terms of Use
                  </Text>{' '}
                  and{' '}
                  <Text
                    style={[styles.termsLink, { color: colors.primary }]}
                    onPress={() =>
                      Linking.openURL('https://herpetoverse.com/privacy-policy')
                    }
                  >
                    Privacy Policy
                  </Text>
                  . I understand there is zero tolerance for objectionable content
                  or abusive behaviour.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={
                  submitting || !email || !username || !password || !agreedToTerms
                }
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor:
                      submitting || !email || !username || !password || !agreedToTerms
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

              {showColdStartHint && (
                <View
                  style={{
                    marginTop: 12,
                    padding: 12,
                    backgroundColor: colors.primary + '15',
                    borderRadius: layout.radius.md,
                    borderWidth: 1,
                    borderColor: colors.primary + '40',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                  accessibilityLiveRegion="polite"
                >
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
                    Waking up our server — this can take 20-30 seconds if it's been idle. Hang tight!
                  </Text>
                </View>
              )}

              {(isGoogleSignInAvailable || appleAvailable) && (
                <View style={styles.socialWrap}>
                  <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.dividerText, { color: colors.textTertiary }]}>or</Text>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  </View>
                  {isGoogleSignInAvailable && (
                    <TouchableOpacity
                      onPress={() => handleOAuth('google')}
                      disabled={submitting}
                      style={[
                        styles.socialButton,
                        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Continue with Google"
                    >
                      <GoogleLogo size={20} />
                      <Text style={[styles.socialButtonText, { color: colors.textPrimary }]}>
                        Continue with Google
                      </Text>
                    </TouchableOpacity>
                  )}
                  {/* Apple's native control — see login.tsx. Requires the
                      view manager present from build 17 onward. */}
                  {appleAvailable && Platform.OS === 'ios' && (
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={
                        AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                      }
                      buttonStyle={
                        AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                      }
                      cornerRadius={layout.radius.md}
                      style={styles.appleButton}
                      onPress={() => handleOAuth('apple')}
                    />
                  )}
                </View>
              )}
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 4,
    marginBottom: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  termsText: { flex: 1, fontSize: 12, lineHeight: 18 },
  termsLink: { fontWeight: '700', textDecorationLine: 'underline' },
  primaryButtonText: {
    color: '#0B0B0B',
    fontSize: 16,
    fontWeight: '700',
  },
  socialWrap: { marginTop: 24, gap: 12 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontWeight: '500' },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 13,
    borderWidth: 1,
  },
  socialButtonText: { fontSize: 15, fontWeight: '600' },
  // Apple renders this control itself; only size is ours to set.
  appleButton: { height: 46, width: '100%' },
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
