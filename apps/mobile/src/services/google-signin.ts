import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import { detailMessage, makeNoAccountError, parseNoAccountDetail } from '../lib/session';

// Check if running in Expo Go (where native modules aren't available)
const isExpoGo = Constants.appOwnership === 'expo';

// OAuth Configuration
const GOOGLE_CLIENT_ID_WEB = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB || '';
const GOOGLE_CLIENT_ID_IOS = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || '';
const GOOGLE_CLIENT_ID_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID || '';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Dynamically import and configure Google Sign-In only in development/production builds
let GoogleSignin: any = null;

// Export flag so UI can conditionally show/hide Google Sign-In button
export const isGoogleSignInAvailable = !isExpoGo;

if (!isExpoGo) {
  try {
    // Dynamic require to avoid crash in Expo Go
    const googleSignInModule = require('@react-native-google-signin/google-signin');
    GoogleSignin = googleSignInModule.GoogleSignin;

    // Configure Google Sign-In
    GoogleSignin.configure({
      webClientId: GOOGLE_CLIENT_ID_WEB,
      iosClientId: GOOGLE_CLIENT_ID_IOS,
      offlineAccess: true,
      forceCodeForRefreshToken: true,
    });

    console.log('[GoogleSignIn] Configured with:');
    console.log('[GoogleSignIn] Web Client ID:', GOOGLE_CLIENT_ID_WEB ? 'Set' : 'Missing');
    console.log('[GoogleSignIn] iOS Client ID:', GOOGLE_CLIENT_ID_IOS ? 'Set' : 'Missing');
    console.log('[GoogleSignIn] Android Client ID:', GOOGLE_CLIENT_ID_ANDROID ? 'Set' : 'Missing');
    console.log('[GoogleSignIn] Platform:', Platform.OS);
  } catch (error) {
    console.warn('[GoogleSignIn] Failed to load native module:', error);
  }
} else {
  console.log('[GoogleSignIn] Running in Expo Go - Google Sign-In is disabled');
  console.log('[GoogleSignIn] Use a development build to test Google Sign-In');
}

export type ProviderIdentity = {
  provider: 'google' | 'apple';
  /** The raw signed ID / identity token. This is the ONLY field the server
   *  trusts — it verifies the signature against the provider's JWKS. */
  idToken: string;
  /** Apple only: one-time code the server exchanges for a revocable refresh
   *  token (account deletion revokes it). Send as `authorization_code`. */
  authorizationCode?: string;
  /** Display-only echoes of the provider profile. The server ignores these. */
  id?: string;
  email?: string;
  name?: string;
  picture?: string;
};

/**
 * Run the native Google Sign-In flow and return the raw provider identity,
 * WITHOUT logging in / creating a session. Used to link Google as an extra
 * sign-in method on the already-authenticated account.
 */
export const getGoogleIdentity = async (): Promise<ProviderIdentity> => {
  if (!GoogleSignin) {
    throw new Error(
      'Google Sign-In is not available in Expo Go. Use a development or production build.'
    );
  }
  await GoogleSignin.hasPlayServices();
  // Force the account chooser so the keeper can pick which Google account to
  // attach (rather than silently reusing a cached session).
  try {
    await GoogleSignin.signOut();
  } catch {
    // ignore — nothing was signed in
  }
  const userInfo = await GoogleSignin.signIn();
  const u = userInfo.data?.user;
  const idToken = userInfo.data?.idToken;
  if (!idToken) {
    throw new Error('Could not read your Google account details. Please try again.');
  }
  return {
    provider: 'google',
    // The signed token is what the server trusts; the rest is display-only.
    idToken,
    id: u?.id,
    email: u?.email ?? undefined,
    name: u?.name ?? undefined,
    picture: u?.photo ?? undefined,
  };
};

/**
 * Run the native Apple Sign-In flow and return the raw provider identity,
 * WITHOUT logging in. Used to link Apple as an extra sign-in method.
 */
export const getAppleIdentity = async (): Promise<ProviderIdentity> => {
  const isAvailable = await AppleAuthentication.isAvailableAsync();
  if (!isAvailable) {
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
  return {
    provider: 'apple',
    idToken: credential.identityToken,
    authorizationCode: credential.authorizationCode ?? undefined,
    id: credential.user,
    email: credential.email ?? undefined,
    name: name || undefined,
  };
};


export type OAuthLoginResult = {
  accessToken: string;
  // True when this sign-in CREATED the account. The server has always sent
  // this (`is_new_user` in schemas/oauth.py) and we used to drop it on the
  // floor; first-run routing needs it, because the alternative — "has this
  // device seen onboarding?" — would show the welcome carousel to every
  // existing keeper, the flag having never been written for anyone.
  isNewUser: boolean;
  user: {
    id: string;
    email: string;
    username: string;
    display_name: string;
    avatar_url?: string;
    // Server always returns collection_visibility on auth responses;
    // typed here so the AuthContext User shape lines up without a cast.
    collection_visibility: string;
    is_superuser?: boolean;
    is_admin?: boolean;
  };
};

export type SocialSignInOptions = {
  /**
   * false (the LOGIN screen): the server refuses with 409 `oauth_no_account`
   * instead of silently creating an account, and the thrown error carries
   * `createAccount()` which re-sends the same credentials with true. This is
   * how a keeper who tapped the wrong button stops ending up with an empty
   * second account. true (the REGISTER screen, and the default) = old behaviour.
   */
  allowCreate?: boolean;
};

/**
 * POST /auth/oauth-login. The body (provider token + Apple's single-use
 * authorization_code) is built by the caller once and reused verbatim for the
 * "Create account" retry; only `allow_create` changes.
 */
async function postOAuthLogin(
  body: Record<string, unknown>,
  allowCreate: boolean,
  failureMessage: string,
): Promise<OAuthLoginResult> {
  const response = await fetch(`${API_URL}/api/v1/auth/oauth-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...body, allow_create: allowCreate }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    // The other 409 on this route ("account exists but is not verified") has a
    // STRING detail, so only an object with code oauth_no_account is this case.
    const noAccount = response.status === 409 ? parseNoAccountDetail(error?.detail) : null;
    if (noAccount) {
      throw makeNoAccountError(noAccount, () => postOAuthLogin(body, true, failureMessage));
    }
    throw new Error(detailMessage(error?.detail, failureMessage));
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    // Defaults to false on an older server that omits the field — erring
    // toward "existing user" keeps the carousel away from people who don't
    // need it, which is the safer direction to be wrong in.
    isNewUser: data.is_new_user === true,
    user: data.user,
  };
}

/**
 * Sign in with Google using @react-native-google-signin/google-signin
 * This properly handles Android OAuth with package name + SHA-1
 */
export const signInWithGoogle = async (
  options: SocialSignInOptions = {},
): Promise<OAuthLoginResult> => {
  const allowCreate = options.allowCreate !== false;
  // Check if Google Sign-In is available
  if (!GoogleSignin) {
    throw new Error(
      'Google Sign-In is not available in Expo Go. Please use a development build to test OAuth login.'
    );
  }

  try {
    console.log('[GoogleSignIn] Starting Google Sign-In flow...');

    // Check if device supports Google Play Services
    await GoogleSignin.hasPlayServices();

    // Sign in
    const userInfo = await GoogleSignin.signIn();

    console.log('[GoogleSignIn] Sign-in successful, exchanging ID token...');

    // Send the RAW signed ID token. The backend verifies it against Google's
    // JWKS (signature/issuer/audience/expiry) and takes the identity from the
    // verified claims. Client-asserted email/id must never be trusted — the
    // endpoint is public, so they can be forged by anyone.
    const idToken = userInfo.data?.idToken;
    if (!idToken) {
      throw new Error('Google did not return an ID token. Please try again.');
    }

    return await postOAuthLogin({ provider: 'google', id_token: idToken }, allowCreate, 'OAuth login failed');
  } catch (error: any) {
    console.error('[GoogleSignIn] Error:', error);

    // Sign out on error to reset state
    try {
      await GoogleSignin.signOut();
    } catch (signOutError) {
      console.error('[GoogleSignIn] Sign out error:', signOutError);
    }

    throw error;
  }
};

/**
 * Sign out from Google
 */
export const signOutFromGoogle = async (): Promise<void> => {
  if (!GoogleSignin) {
    // No-op in Expo Go
    return;
  }

  try {
    await GoogleSignin.signOut();
    console.log('[GoogleSignIn] Signed out successfully');
  } catch (error) {
    console.error('[GoogleSignIn] Sign out error:', error);
  }
};

/**
 * Sign in with Apple
 * iOS only - Apple Sign In is required for App Store
 */
export const signInWithApple = async (
  options: SocialSignInOptions = {},
): Promise<OAuthLoginResult> => {
  const allowCreate = options.allowCreate !== false;
  try {
    console.log('[AppleSignIn] Starting Apple Sign-In flow...');

    // Check if Apple Authentication is available (iOS 13+)
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Apple Sign In is not available on this device');
    }

    // Request Apple Sign In
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    console.log('[AppleSignIn] Sign-in successful, sending to backend...');

    // Extract user info from credential
    const appleUser = credential.user; // This is the unique Apple user ID (sub)
    const email = credential.email; // Only provided on first sign in
    const fullName = credential.fullName;

    // Construct name from fullName if available
    let name = '';
    if (fullName) {
      const firstName = fullName.givenName || '';
      const lastName = fullName.familyName || '';
      name = `${firstName} ${lastName}`.trim();
    }

    // Send the RAW signed identity token — the backend verifies it against
    // Apple's JWKS and reads `sub`/`email` from the verified claims. The name
    // is cosmetic (Apple sends it only once, outside the token).
    if (!credential.identityToken) {
      throw new Error('Apple did not return an identity token. Please try again.');
    }

    // The body is built ONCE and reused if the keeper confirms "Create
    // account": Apple's authorization_code is single-use, and a refusal for
    // "no account" does not consume it, so the same code goes with the retry.
    return await postOAuthLogin(
      {
        provider: 'apple',
        identity_token: credential.identityToken,
        // One-time code the server exchanges for a refresh token, so deleting
        // the account can revoke Sign in with Apple (App Store 5.1.1(v)).
        authorization_code: credential.authorizationCode ?? undefined,
        name: name || 'Apple User',
      },
      allowCreate,
      'Apple OAuth login failed',
    );
  } catch (error: any) {
    console.error('[AppleSignIn] Error:', error);

    // Check for user cancellation
    if (error.code === 'ERR_CANCELED' || error.code === 'ERR_REQUEST_CANCELED') {
      throw new Error('Apple Sign In was cancelled');
    }

    throw error;
  }
};
