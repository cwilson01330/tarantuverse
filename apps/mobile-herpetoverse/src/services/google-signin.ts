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
import { detailMessage, makeNoAccountError, parseNoAccountDetail } from '../lib/session';

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

export interface SocialSignInOptions {
  /**
   * false (the LOGIN screen): the server refuses with 409 `oauth_no_account`
   * instead of silently creating an account, and the thrown error carries
   * `createAccount()` which re-sends the same credentials with true. This is
   * how a keeper who tapped the wrong button stops ending up with an empty
   * second account. true (the REGISTER screen, and the default) = old behaviour.
   */
  allowCreate?: boolean;
}

/**
 * POST /auth/oauth-login. The body (provider token + Apple's single-use
 * authorization_code) is built by the caller once and reused verbatim for the
 * "Create account" retry; only `allow_create` changes.
 */
async function exchangeWithBackend(
  body: Record<string, unknown>,
  allowCreate: boolean,
): Promise<OAuthResult> {
  const response = await fetch(`${API_URL}/api/v1/auth/oauth-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, allow_create: allowCreate }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    // The other 409 on this route ("account exists but is not verified") has a
    // STRING detail, so only an object with code oauth_no_account is this case.
    const noAccount = response.status === 409 ? parseNoAccountDetail(err?.detail) : null;
    if (noAccount) {
      throw makeNoAccountError(noAccount, () => exchangeWithBackend(body, true));
    }
    throw new Error(detailMessage(err?.detail, 'OAuth login failed'));
  }
  const data = await response.json();
  return { accessToken: data.access_token, user: data.user };
}

/** Native Google sign-in → shared backend → session tokens. */
export async function signInWithGoogle(options: SocialSignInOptions = {}): Promise<OAuthResult> {
  const allowCreate = options.allowCreate !== false;
  if (!GoogleSignin) {
    throw new Error(
      'Google Sign-In needs a dev/production build (not available in Expo Go).',
    );
  }
  try {
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    // Send the RAW signed ID token — the backend verifies it against Google's
    // JWKS and derives the identity itself. Never send client-asserted
    // email/id: the endpoint is public, so asserted claims are forgeable.
    const idToken = userInfo.data?.idToken;
    if (!idToken) {
      throw new Error('Google did not return an ID token. Please try again.');
    }
    return await exchangeWithBackend(
      {
        provider: 'google',
        id_token: idToken,
      },
      allowCreate,
    );
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
export async function signInWithApple(options: SocialSignInOptions = {}): Promise<OAuthResult> {
  const allowCreate = options.allowCreate !== false;
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
  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token. Please try again.');
  }
  // The body is built ONCE and reused if the keeper confirms "Create account":
  // Apple's authorization_code is single-use, and a refusal for "no account"
  // does not consume it, so the same code goes with the retry.
  return exchangeWithBackend(
    {
      provider: 'apple',
      // Raw signed token — backend verifies against Apple's JWKS and reads the
      // `sub`/`email` from the verified claims.
      identity_token: credential.identityToken,
      // One-time code the server exchanges for a refresh token, so deleting
      // the account can revoke Sign in with Apple (App Store 5.1.1(v)).
      authorization_code: credential.authorizationCode ?? undefined,
      // Cosmetic only. Apple omits the name from the token and sends it just
      // once, on first consent.
      name: name || 'Apple User',
    },
    allowCreate,
  );
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
