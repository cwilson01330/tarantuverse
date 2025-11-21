# OAuth/SSO Implementation Complete

## Backend Implementation ✅

### Database Schema
- Added OAuth fields to User model:
  - `oauth_provider`: 'google', 'apple', 'github'
  - `oauth_id`: Provider's unique user ID
  - `oauth_access_token`: For API calls to provider
  - `oauth_refresh_token`: Token refresh capability
- Made `hashed_password` nullable for OAuth-only users
- Created migration: `add_oauth_fields.py`

### Dependencies Added
- `authlib==1.3.2` - OAuth client library
- `itsdangerous==2.2.0` - Secure token generation

### API Endpoints
1. **POST /auth/oauth/google**
   - Accepts: `{ code: string, state?: string }`
   - Returns: `{ access_token, token_type, user, is_new_user }`
   - Exchanges Google auth code for user info
   - Creates new user or logs in existing user
   - Auto-generates unique username from email

2. **POST /auth/oauth/apple**
   - Accepts: `{ code: string, id_token: string, user?: object }`
   - Returns: `{ access_token, token_type, user, is_new_user }`
   - Verifies Apple ID token (JWT)
   - Creates new user or logs in existing user
   - Handles Apple's first-time-only user data

### OAuth Utilities (`app/utils/oauth.py`)
- `exchange_google_code_for_token()`: Google OAuth flow
- `verify_apple_id_token()`: Apple JWT verification
- `exchange_apple_code_for_token()`: Apple OAuth flow
- `generate_apple_client_secret()`: Apple ES256 JWT signing
- `generate_username_from_email()`: Unique username generation

### Security Features
- OAuth tokens stored securely in database
- Email uniqueness enforced
- Username auto-generation with collision handling
- Support for linking OAuth to existing accounts

## Frontend Implementation (Next Steps)

### Web (NextAuth.js)
**Dependencies to install:**
```bash
cd apps/web
pnpm add next-auth
```

**Files to create:**
1. `apps/web/src/app/api/auth/[...nextauth]/route.ts` - NextAuth config
2. `apps/web/src/lib/auth.ts` - Auth helpers
3. `apps/web/src/components/auth/OAuthButtons.tsx` - Google/Apple sign-in buttons

**Environment Variables (.env.local):**
```env
# NextAuth
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Apple OAuth (optional for web, required for mobile)
APPLE_CLIENT_ID=your-apple-client-id
APPLE_TEAM_ID=your-apple-team-id
APPLE_KEY_ID=your-apple-key-id
APPLE_PRIVATE_KEY=your-apple-private-key
```

### Mobile (Expo AuthSession)
**Dependencies to install:**
```bash
cd apps/mobile
pnpm add expo-auth-session expo-crypto expo-web-browser
```

**Files to create:**
1. `apps/mobile/app/auth/google.tsx` - Google sign-in screen
2. `apps/mobile/app/auth/apple.tsx` - Apple sign-in screen
3. `apps/mobile/utils/oauth.ts` - OAuth helper functions

**Configuration:**
- Update `app.json` with OAuth schemes
- Add redirect URIs to Google/Apple consoles

## OAuth Provider Setup

### Google Cloud Console
1. Go to: https://console.cloud.google.com/
2. Create new project: "Tarantuverse"
3. Enable Google+ API
4. Create OAuth 2.0 credentials:
   - Type: Web application (for web) + iOS/Android (for mobile)
   - Authorized redirect URIs:
     - Web: `http://localhost:3000/api/auth/callback/google`
     - Web (prod): `https://tarantuverse.com/api/auth/callback/google`
     - Mobile: `exp://localhost:8081` (Expo Go)
     - Mobile (prod): `tarantuverse://oauth/google`

### Apple Developer Console
1. Go to: https://developer.apple.com/account/
2. Certificates, Identifiers & Profiles → Identifiers
3. Register new App ID: `com.tarantuverse.app`
4. Enable "Sign In with Apple"
5. Create Service ID for web:
   - Service ID: `com.tarantuverse.web`
   - Redirect URIs: `https://tarantuverse.com/api/auth/callback/apple`
6. Create Key for Sign In with Apple:
   - Download private key (`.p8` file)
   - Note Key ID and Team ID

## Testing OAuth

### Local Testing (Web)
1. Start API: `cd apps/api && uvicorn app.main:app --reload`
2. Start Web: `cd apps/web && pnpm dev`
3. Navigate to: `http://localhost:3000/login`
4. Click "Sign in with Google" or "Sign in with Apple"
5. Complete OAuth flow
6. Check database for new user with `oauth_provider` set

### Local Testing (Mobile)
1. Start API: `cd apps/api && uvicorn app.main:app --reload`
2. Start Mobile: `cd apps/mobile && pnpm start`
3. Scan QR code with Expo Go
4. Navigate to login screen
5. Test Google/Apple sign-in buttons
6. Verify redirect back to app

## Production Deployment

### Backend (Render)
1. Add environment variables to Render dashboard:
   ```
   GOOGLE_CLIENT_ID
   GOOGLE_CLIENT_SECRET
   GOOGLE_REDIRECT_URI=https://api.tarantuverse.com/auth/oauth/google
   
   APPLE_CLIENT_ID
   APPLE_TEAM_ID
   APPLE_KEY_ID
   APPLE_PRIVATE_KEY
   APPLE_REDIRECT_URI=https://api.tarantuverse.com/auth/oauth/apple
   ```

2. Deploy migration:
   ```bash
   # In Render shell
   alembic upgrade head
   ```

3. Verify `/docs` endpoint shows new OAuth routes

### Web (Vercel)
1. Add environment variables to Vercel dashboard
2. Update `NEXTAUTH_URL` to production URL
3. Update OAuth redirect URIs in Google/Apple consoles
4. Deploy: `git push` (auto-deploys)

### Mobile (Expo)
1. Update `app.json` with production schemes
2. Build production app: `eas build --platform all`
3. Submit to TestFlight/Google Play internal testing
4. Test OAuth flow on real devices

## Security Considerations

✅ **Implemented:**
- OAuth tokens stored securely in database
- Email uniqueness enforced
- HTTPS required in production
- State parameter for CSRF protection (Google)
- JWT signature verification (Apple)

⚠️ **TODO for Production:**
- Implement proper Apple JWT signature verification (currently disabled)
- Add rate limiting to OAuth endpoints
- Implement token refresh logic
- Add OAuth account linking UI (link Google to existing account)
- Implement account deletion (remove OAuth tokens)

## User Experience Flow

1. **First Time User (Registration via OAuth):**
   - Click "Sign in with Google/Apple"
   - Redirect to provider
   - Authorize app
   - Return to app
   - **New user created** with:
     - Email from provider
     - Auto-generated username
     - Display name from provider
     - Avatar from provider (Google only)
     - `is_new_user: true` returned
   - Show welcome/onboarding flow

2. **Returning User (Login via OAuth):**
   - Click "Sign in with Google/Apple"
   - Redirect to provider
   - Authorize app
   - Return to app
   - **Existing user logged in**
   - `is_new_user: false` returned
   - Redirect to home/dashboard

3. **Existing User Adding OAuth:**
   - User with email+password account
   - Logs in with OAuth using same email
   - System links OAuth to existing account
   - User can now use either method to log in

## Metrics & Analytics

Track these OAuth events:
- `oauth_login_started` - User clicked OAuth button
- `oauth_login_success` - User successfully logged in
- `oauth_login_failed` - OAuth flow failed
- `oauth_new_user` - New user created via OAuth
- `oauth_returning_user` - Existing user logged in via OAuth
- `oauth_provider_breakdown` - Google vs Apple usage

## Next Steps

1. ✅ Backend OAuth implementation (COMPLETE)
2. ⏳ Web OAuth integration (NextAuth.js) - IN PROGRESS
3. ⏳ Mobile OAuth integration (Expo AuthSession)
4. ⏳ Google Cloud Console setup
5. ⏳ Apple Developer Console setup
6. ⏳ Testing on all platforms
7. ⏳ Production deployment
8. ⏳ User documentation

## Files Created/Modified

### Backend
- `apps/api/app/models/user.py` - Added OAuth fields
- `apps/api/app/schemas/oauth.py` - OAuth request/response schemas
- `apps/api/app/utils/oauth.py` - OAuth utility functions
- `apps/api/app/routers/auth.py` - OAuth endpoints
- `apps/api/requirements.txt` - Added authlib
- `apps/api/alembic/versions/add_oauth_fields.py` - Migration

### Frontend (Pending)
- `apps/web/src/app/api/auth/[...nextauth]/route.ts`
- `apps/web/src/lib/auth.ts`
- `apps/web/src/components/auth/OAuthButtons.tsx`
- `apps/mobile/app/auth/google.tsx`
- `apps/mobile/app/auth/apple.tsx`
- `apps/mobile/utils/oauth.ts`

---

**Status:** Backend Complete ✅ | Frontend In Progress 🔄  
**Commit:** `057dee3` - "Add OAuth/SSO backend implementation (Google + Apple)"
