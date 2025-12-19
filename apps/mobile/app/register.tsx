import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth, isGoogleSignInAvailable } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { apiClient } from '../src/services/api';
import GoogleLogo from '../src/components/GoogleLogo';

interface ReferrerInfo {
  valid: boolean;
  referrer_username?: string;
  referrer_display_name?: string;
  message?: string;
}

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ref?: string }>();
  const { register, loginWithGoogle, loginWithApple } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referrerInfo, setReferrerInfo] = useState<ReferrerInfo | null>(null);
  const [validatingReferral, setValidatingReferral] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [success, setSuccess] = useState(false);

  // Check for referral code from URL params
  useEffect(() => {
    if (params.ref) {
      setReferralCode(params.ref.toUpperCase());
      validateReferralCode(params.ref);
    }
  }, [params.ref]);

  const validateReferralCode = async (code: string) => {
    if (!code || code.length < 8) {
      setReferrerInfo(null);
      return;
    }

    setValidatingReferral(true);
    try {
      const response = await apiClient.get(`/referrals/validate/${code}`);
      setReferrerInfo(response.data);
    } catch (err) {
      setReferrerInfo({ valid: false, message: 'Could not validate referral code' });
    } finally {
      setValidatingReferral(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !username || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (!agreedToTerms) {
      Alert.alert('Error', 'You must agree to the Terms of Service and Community Guidelines to create an account');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      // Only include referral code if it's valid
      const validReferralCode = referrerInfo?.valid ? referralCode : undefined;
      await register(email, username, password, displayName || username, validReferralCode);
      // Registration successful - show verification message
      setSuccess(true);
    } catch (error: any) {
      Alert.alert('Registration Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setOauthLoading('google');
    try {
      await loginWithGoogle();
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Google Sign-In Failed', error.message);
    } finally {
      setOauthLoading(null);
    }
  };

  const handleAppleRegister = async () => {
    setOauthLoading('apple');
    try {
      await loginWithApple();
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Apple Sign-In Failed', error.message);
    } finally {
      setOauthLoading(null);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      paddingTop: 60,
      paddingBottom: 40,
    },
    logo: {
      fontSize: 80,
      marginBottom: 20,
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      color: colors.primary,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textTertiary,
      marginBottom: 40,
    },
    form: {
      width: '100%',
      maxWidth: 400,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 16,
      marginBottom: 16,
      fontSize: 16,
      color: colors.textPrimary,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    linkButton: {
      marginTop: 16,
      alignItems: 'center',
    },
    linkText: {
      color: colors.primary,
      fontSize: 14,
    },
    termsContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 16,
      marginTop: 8,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: colors.border,
      marginRight: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 2,
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    checkmark: {
      color: '#fff',
      fontSize: 14,
      fontWeight: 'bold',
    },
    termsText: {
      flex: 1,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    termsLink: {
      color: colors.primary,
      textDecorationLine: 'underline',
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 24,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      marginHorizontal: 16,
      color: colors.textTertiary,
      fontSize: 14,
    },
    oauthButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 14,
      marginBottom: 12,
    },
    oauthButtonText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 12,
    },
    appleButton: {
      width: '100%',
      height: 50,
      marginBottom: 12,
    },
    referralValidation: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      padding: 8,
      borderRadius: 6,
      gap: 8,
    },
    referralValid: {
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
    },
    referralInvalid: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    referralText: {
      flex: 1,
      fontSize: 13,
    },
    referralValidText: {
      color: '#22c55e',
    },
    referralInvalidText: {
      color: '#ef4444',
    },
    referralHint: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 4,
    },
  });

  // Show success screen if registration was successful
  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={{ width: 64, height: 64, backgroundColor: '#10B981', borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 32, color: '#fff' }}>✓</Text>
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Registration Successful!</Text>
          <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 16, marginBottom: 32 }]}>
            We've sent a verification email to {email}.{'\n'}
            Please check your inbox and verify your account to log in.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/login')}
          >
            <Text style={styles.buttonText}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.logo}>🕷️</Text>
          <Text style={styles.title}>Join Tarantuverse</Text>
          <Text style={styles.subtitle}>Create your account</Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email *"
              placeholderTextColor={colors.textTertiary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Username *"
              placeholderTextColor={colors.textTertiary}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Display Name (optional)"
              placeholderTextColor={colors.textTertiary}
              value={displayName}
              onChangeText={setDisplayName}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Password *"
              placeholderTextColor={colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
              textContentType="newPassword"
              autoComplete="new-password"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm Password *"
              placeholderTextColor={colors.textTertiary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!loading}
              textContentType="newPassword"
              autoComplete="new-password"
              autoCorrect={false}
            />

            {/* Referral Code */}
            <TextInput
              style={styles.input}
              placeholder="Referral Code (optional)"
              placeholderTextColor={colors.textTertiary}
              value={referralCode}
              onChangeText={(text) => {
                const code = text.toUpperCase();
                setReferralCode(code);
                if (code.length >= 8) {
                  validateReferralCode(code);
                } else {
                  setReferrerInfo(null);
                }
              }}
              autoCapitalize="characters"
              maxLength={12}
              editable={!loading}
            />
            {validatingReferral && (
              <Text style={styles.referralHint}>Validating referral code...</Text>
            )}
            {referrerInfo && !validatingReferral && (
              <View
                style={[
                  styles.referralValidation,
                  referrerInfo.valid ? styles.referralValid : styles.referralInvalid,
                ]}
              >
                <MaterialCommunityIcons
                  name={referrerInfo.valid ? 'check-circle' : 'close-circle'}
                  size={18}
                  color={referrerInfo.valid ? '#22c55e' : '#ef4444'}
                />
                <Text
                  style={[
                    styles.referralText,
                    referrerInfo.valid ? styles.referralValidText : styles.referralInvalidText,
                  ]}
                >
                  {referrerInfo.valid
                    ? `Referred by @${referrerInfo.referrer_username}`
                    : referrerInfo.message || 'Invalid referral code'}
                </Text>
              </View>
            )}

            {/* Terms of Service Agreement */}
            <View style={styles.termsContainer}>
              <TouchableOpacity
                style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}
                onPress={() => setAgreedToTerms(!agreedToTerms)}
                disabled={loading}
              >
                {agreedToTerms && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text
                  style={styles.termsLink}
                  onPress={() => router.push('/terms')}
                >
                  Terms of Service
                </Text>{' '}
                and{' '}
                <Text
                  style={styles.termsLink}
                  onPress={() => router.push('/terms')}
                >
                  Community Guidelines
                </Text>
                . I understand there is zero tolerance for objectionable content or abusive behavior.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google Sign In - only shown in development/production builds */}
            {isGoogleSignInAvailable && (
              <TouchableOpacity
                style={styles.oauthButton}
                onPress={handleGoogleRegister}
                disabled={loading || oauthLoading !== null}
              >
                {oauthLoading === 'google' ? (
                  <ActivityIndicator color={colors.textPrimary} />
                ) : (
                  <>
                    <GoogleLogo size={24} />
                    <Text style={styles.oauthButtonText}>Continue with Google</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Apple Sign In (iOS only) - Use WHITE_OUTLINE for light mode for better contrast */}
            {Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={
                  colors.background === '#000000' || colors.background === '#121212' || colors.background.toLowerCase().startsWith('#1')
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE
                }
                cornerRadius={8}
                style={styles.appleButton}
                onPress={handleAppleRegister}
              />
            )}

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => router.back()}
              disabled={loading}
            >
              <Text style={styles.linkText}>Already have an account? Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
