import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

// Required for web browser to close properly after OAuth
WebBrowser.maybeCompleteAuthSession();

// OAuth Configuration
const GOOGLE_CLIENT_ID_WEB = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB || '';
const GOOGLE_CLIENT_ID_IOS = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || '';
const GOOGLE_CLIENT_ID_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID || '';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Get the appropriate Google Client ID for the platform
const getGoogleClientId = () => {
  if (Platform.OS === 'ios') {
    return GOOGLE_CLIENT_ID_IOS;
  } else if (Platform.OS === 'android') {
    return GOOGLE_CLIENT_ID_ANDROID;
  }
  return GOOGLE_CLIENT_ID_WEB;
};

// OAuth redirect URI - use native property for explicit control
// This should match the redirect URI configured in Google Cloud Console
const redirectUri = AuthSession.makeRedirectUri({
  native: 'tarantuverse://auth',
});

console.log('[OAuth] Redirect URI:', redirectUri);
console.log('[OAuth] Platform:', Platform.OS);
console.log('[OAuth] Client ID:', getGoogleClientId());

/**
 * Initiate Google OAuth flow
 * Returns user data and access token from our backend
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
    const clientId = getGoogleClientId();

    if (!clientId) {
      throw new Error('Google Client ID not configured');
    }

    console.log('[OAuth] Starting Google OAuth flow...');

    // Create OAuth request
    const discovery = {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
    };

    const request = new AuthSession.AuthRequest({
      clientId,
      scopes: ['openid', 'profile', 'email'],
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true, // Proof Key for Code Exchange (more secure)
    });

    // Prompt user for authorization
    const result = await request.promptAsync(discovery);

    console.log('[OAuth] Auth result:', result.type);

    if (result.type !== 'success') {
      throw new Error('OAuth was cancelled or failed');
    }

    const { code } = result.params;

    if (!code) {
      throw new Error('No authorization code received');
    }

    console.log('[OAuth] Got authorization code, exchanging with backend...');

    // Exchange code with our backend (which will handle Google token exchange)
    const response = await fetch(`${API_URL}/api/v1/auth/oauth/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'OAuth login failed');
    }

    const data = await response.json();

    console.log('[OAuth] Login successful!');

    return {
      accessToken: data.access_token,
      user: data.user,
    };
  } catch (error: any) {
    console.error('[OAuth] Error:', error);
    throw error;
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
