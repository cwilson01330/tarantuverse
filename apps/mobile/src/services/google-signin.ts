import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

// OAuth Configuration
const GOOGLE_CLIENT_ID_WEB = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB || '';
const GOOGLE_CLIENT_ID_IOS = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || '';
const GOOGLE_CLIENT_ID_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID || '';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Configure Google Sign-In
GoogleSignin.configure({
  webClientId: GOOGLE_CLIENT_ID_WEB, // From Google Cloud Console
  iosClientId: GOOGLE_CLIENT_ID_IOS, // From Google Cloud Console
  offlineAccess: true, // To get server auth code
  forceCodeForRefreshToken: true,
});

console.log('[GoogleSignIn] Configured with:');
console.log('[GoogleSignIn] Web Client ID:', GOOGLE_CLIENT_ID_WEB ? 'Set' : 'Missing');
console.log('[GoogleSignIn] iOS Client ID:', GOOGLE_CLIENT_ID_IOS ? 'Set' : 'Missing');
console.log('[GoogleSignIn] Android Client ID:', GOOGLE_CLIENT_ID_ANDROID ? 'Set' : 'Missing');
console.log('[GoogleSignIn] Platform:', Platform.OS);

/**
 * Sign in with Google using @react-native-google-signin/google-signin
 * This properly handles Android OAuth with package name + SHA-1
 */
export const signInWithGoogle = async (): Promise<{
  accessToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}> => {
  try {
    console.log('[GoogleSignIn] Starting Google Sign-In flow...');

    // Check if device supports Google Play Services
    await GoogleSignin.hasPlayServices();

    // Sign in
    const userInfo = await GoogleSignin.signIn();

    console.log('[GoogleSignIn] Sign-in successful, getting server auth code...');

    // Get server auth code to exchange with backend
    const tokens = await GoogleSignin.getTokens();

    console.log('[GoogleSignIn] Got tokens, exchanging with backend...');
    console.log('[GoogleSignIn] User info:', userInfo.data);

    // Send user info directly to backend (no code exchange needed)
    const response = await fetch(`${API_URL}/api/v1/auth/oauth-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'google',
        email: userInfo.data?.user?.email,
        name: userInfo.data?.user?.name,
        picture: userInfo.data?.user?.photo,
        id: userInfo.data?.user?.id,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'OAuth login failed');
    }

    const data = await response.json();

    console.log('[GoogleSignIn] Login successful!');

    return {
      accessToken: data.access_token,
      user: data.user,
    };
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
export const signInWithApple = async (): Promise<{
  accessToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}> => {
  // Apple Sign In requires native module - will implement when building production app
  throw new Error('Apple Sign In not yet implemented - use Google OAuth or email/password');
};
