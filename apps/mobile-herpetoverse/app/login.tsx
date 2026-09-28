/**
 * Email + password sign-in.
 *
 * Posts to the shared `/auth/login` endpoint. Tarantuverse accounts log
 * right in — same user table, same credentials. On success we land the
 * keeper on the Collection tab via the `/(tabs)` route.
 */
import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import * as AppleAuthentication from 'expo-apple-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';
import GoogleLogo from '../src/components/GoogleLogo';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { captureEvent } from '../src/services/posthog';
import { warmupApi, useColdStartIndicator } from '../src/utils/cold-start';
import {
  isGoogleSignInAvailable,
  isAppleSignInAvailable,
} from '../src/services/google-signin';
import { apiClient } from '../src/services/api';
import { HV_WEB_ORIGIN } from '../src/lib/web-origin';

type ResendState = 'idle' | 'sending' | 'sent' | 'error';

export default function LoginScreen() {
  const router = useRouter();
  const { login, loginWithGoogle, loginWithApple } = useAuth();
  const { colors, layout } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  // Set when sign-in fails because the address was never verified. Before
  // this the screen just printed "Email not verified" — and since links
  // expire, a keeper who came back late had no working link and no way to
  // ask for one.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<ResendState>('idle');

  function onEmailChange(value: string) {
    setEmail(value);
    if (unverifiedEmail) {
      setUnverifiedEmail(null);
      setResendState('idle');
    }
  }

  async function handleResend() {
    if (!unverifiedEmail) return;
    setResendState('sending');
    try {
      // JSON body, never ?email=. frontend_url makes the email say
      // "Herpetoverse" and link back to herpetoverse.com.
      await apiClient.post('/auth/resend-verification', {
        email: unverifiedEmail,
        frontend_url: HV_WEB_ORIGIN,
      });
      captureEvent('verification_resent', { source: 'login' });
      setResendState('sent');
    } catch {
      setResendState('error');
    }
  }

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  // Kick the Render container awake the moment this screen mounts. By
  // the time the user finishes typing credentials, the API is likely
  // warm and the real login hits a hot worker. Same fix we shipped on
  // Tarantuverse mobile.
  useEffect(() => {
    warmupApi();
  }, []);

  // If login takes >3s, surface a "Waking up server" hint.
  const showColdStartHint = useColdStartIndicator(submitting, 3000);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);
    setUnverifiedEmail(null);
    setResendState('idle');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      captureEvent('login_success', { method: 'email' });
      router.replace('/(tabs)/dashboard');
    } catch (err: any) {
      if (err?.code === 'email_not_verified') {
        captureEvent('login_failed', { method: 'email', reason: 'unverified' });
        // The resend card replaces the red error box for this case.
        setUnverifiedEmail(email.trim());
      } else {
        captureEvent('login_failed', { method: 'email' });
        setError(err.message || 'Could not sign in.');
      }
    } finally {
      setSubmitting(false);
    }
  }

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
      captureEvent('login_success', { method: provider });
      router.replace('/(tabs)/dashboard');
    } catch (err: any) {
      const msg = err?.message || '';
      // Swallow user-cancelled flows quietly.
      if (!/cancel/i.test(msg)) {
        captureEvent('login_failed', { method: provider });
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
              Welcome back, keeper.
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
            <TextInput
              value={email}
              onChangeText={onEmailChange}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@example.com"
              placeholderTextColor={colors.textTertiary}
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                  borderRadius: layout.radius.md,
                },
              ]}
              editable={!submitting}
            />

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>
              Password
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              placeholder="••••••••"
              placeholderTextColor={colors.textTertiary}
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                  borderRadius: layout.radius.md,
                },
              ]}
              editable={!submitting}
            />

            <View style={{ alignItems: 'flex-end', marginTop: 8 }}>
              <Link href="/forgot-password" asChild>
                <TouchableOpacity disabled={submitting} accessibilityRole="link">
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '500' }}>
                    Forgot password?
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>

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

            {unverifiedEmail && (
              <View
                style={[
                  styles.errorBox,
                  {
                    backgroundColor: `${colors.warning}1A`,
                    borderColor: colors.warning,
                    borderRadius: layout.radius.md,
                  },
                ]}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                <Text style={[styles.verifyTitle, { color: colors.textPrimary }]}>
                  {resendState === 'sent' ? 'New link sent' : 'Confirm your email first'}
                </Text>
                <Text style={[styles.verifyBody, { color: colors.textSecondary }]}>
                  {resendState === 'sent'
                    ? `Check the inbox for ${unverifiedEmail} — and the spam folder, just in case. The link works for 3 days.`
                    : resendState === 'error'
                      ? "We couldn't send that just now. Check your connection and try again."
                      : `We sent a confirmation link to ${unverifiedEmail} when you signed up. If you can't find it, or it's stopped working, we'll send a fresh one.`}
                </Text>
                {resendState !== 'sent' && (
                  <TouchableOpacity
                    onPress={handleResend}
                    disabled={resendState === 'sending'}
                    style={[
                      styles.verifyButton,
                      {
                        backgroundColor: colors.warning,
                        borderRadius: layout.radius.md,
                        opacity: resendState === 'sending' ? 0.6 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Send a new verification link"
                  >
                    {resendState === 'sending' ? (
                      <ActivityIndicator color="#0B0B0B" />
                    ) : (
                      // Dark text on amber: white on #F59E0B fails contrast.
                      <Text style={styles.verifyButtonText}>Send a new link</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting || !email || !password}
              style={[
                styles.primaryButton,
                {
                  backgroundColor:
                    submitting || !email || !password
                      ? colors.surfaceRaised
                      : colors.primary,
                  borderRadius: layout.radius.md,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              {submitting ? (
                <ActivityIndicator color="#0B0B0B" />
              ) : (
                <Text style={styles.primaryButtonText}>Sign in</Text>
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
          </View>

          {(isGoogleSignInAvailable || appleAvailable) && (
            <View style={styles.socialWrap}>
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.textTertiary }]}>or</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>
              {/* Google's official four-colour mark — branding terms don't
                  allow a generic icon-font glyph here. */}
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
              {/* Apple's NATIVE button — Guideline 4.8 / the HIG require the
                  system-rendered control, not a lookalike.

                  This renders a native VIEW, so it only works in a binary that
                  registers the ExpoAppleAuthentication view manager. Build 16
                  did not, which is why an earlier OTA attempt crashed the
                  screen. It is being restored HERE, in the same change that
                  cuts a fresh native build, and runtimeVersion is bumped to
                  1.1.0 so this JS can never reach build 16. */}
              {appleAvailable && Platform.OS === 'ios' && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={
                    AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
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

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textTertiary }]}>
              New to Herpetoverse?
            </Text>
            <Link href="/register" asChild>
              <TouchableOpacity>
                <Text style={[styles.footerLink, { color: colors.primary }]}>
                  Create an account
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
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
  input: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  errorBox: {
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
  },
  errorText: { fontSize: 14 },
  verifyTitle: { fontSize: 14, fontWeight: '700' },
  verifyBody: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  verifyButton: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  verifyButtonText: { color: '#0B0B0B', fontSize: 15, fontWeight: '700' },
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
  // Apple renders this control itself; only size is ours to set. Height must
  // be >= 44 for the HIG minimum touch target, and matches socialButton's
  // effective height so the two stack evenly.
  appleButton: { height: 46, width: '100%' },
  footer: {
    marginTop: 32,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  footerText: { fontSize: 14 },
  footerLink: { fontSize: 14, fontWeight: '600' },
});
