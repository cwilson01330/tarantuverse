/**
 * Google + Apple sign-in for Herpetoverse mobile.
 *
 * Ported from the Tarantuverse implementation. Both providers exchange the
 * provider identity with the SHARED backend at `/api/v1/auth/oauth-login`
 * (app-agnostic — same endpoint TV uses), which upserts a UserOAuthAccount
 * and returns { access_token, user }.
 *
 * Native modules are dynamically required so this never crashes in Expo Go
 * (where they aren't linked). `isGoogleSignInAvailable` lets the UI hide the
 * button in Expo Go. Requires a dev/prod build + the HV OAuth client IDs
 * (see docs/design/HV_GOOGLE_SIGNIN_SETUP.md).
 */
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';

const isExpoGo = Constants.appOwnership === 'expo';

// HV's OWN OAuth client IDs — set in apps/mobile-herpetoverse/.env. These are
// DIFFERENT from Tarantuverse's; HV has its own Google Cloud OAuth clients.
const GOOGLE_CLIENT_ID_WEB = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB || '';
const GOOGLE_CLIENT_ID_IOS = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || '';
const GOOGLE_CLIENT_ID_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID || '';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

let GoogleSignin: any = null;

/** UI flag — Google sign-in only works in dev/prod builds, not Expo Go. */
export const isGoogleSignInAvailable = !isExpoGo;

if (!isExpoGo) {
  try {
    const mod = require('@react-native-google-signin/google-signin');
    GoogleSignin = mod.GoogleSignin;
    GoogleSignin.configure({
      webClientId: GOOGLE_CLIENT_ID_WEB,
      iosClientId: GOOGLE_CLIENT_ID_IOS,
      offlineAccess: true,
      forceCodeForRefreshToken: true,
    });
  } catch (error) {
    console.warn('[GoogleSignIn] native module not available:', error);
  }
}

export interface OAuthResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
    is_admin?: boolean;
    is_superuser?: boolean;
  };
}

async function exchangeWithBackend(body: Record<string, unknown>): Promise<OAuthResult> {
  const response = await fetch(`${API_URL}/api/v1/auth/oauth-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'OAuth login failed');
  }
  const data = await response.json();
  return { accessToken: data.access_token, user: data.user };
}

/** Native Google sign-in → shared backend → session tokens. */
export async function signInWithGoogle(): Promise<OAuthResult> {
  if (!GoogleSignin) {
    throw new Error(
      'Google Sign-In needs a dev/production build (not available in Expo Go).',
    );
  }
  try {
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    return await exchangeWithBackend({
      provider: 'google',
      email: userInfo.data?.user?.email,
      name: userInfo.data?.user?.name,
      picture: userInfo.data?.user?.photo,
      id: userInfo.data?.user?.id,
    });
  } catch (error) {
    try {
      await GoogleSignin.signOut();
    } catch {
      // reset silently
    }
    throw error;
  }
}

/** Native Apple sign-in (iOS) → shared backend → session tokens. */
export async function signInWithApple(): Promise<OAuthResult> {
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error('Apple Sign In is not available on this device.');
  }
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  let name = '';
  if (credential.fullName) {
    name = `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim();
  }
  return exchangeWithBackend({
    provider: 'apple',
    // Apple only sends email on first consent; fall back to the private relay.
    email: credential.email || `${credential.user}@privaterelay.appleid.com`,
    name: name || 'Apple User',
    id: credential.user, // stable Apple `sub`
  });
}

/** True on iOS 13+ where Apple sign-in is offered (required by App Store 4.8). */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signOutFromGoogle(): Promise<void> {
  if (!GoogleSignin) return;
  try {
    await GoogleSignin.signOut();
  } catch {
    // ignore
  }
}
