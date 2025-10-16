# Google OAuth Setup Guide - Quick Start

## ⚡ Quick Setup (15 minutes)

### Step 1: Create Google Cloud Project
1. Go to: **https://console.cloud.google.com/**
2. Click "Select a project" → "New Project"
3. Project name: `Tarantuverse`
4. Click "Create"

### Step 2: Enable Google+ API
1. In the Google Cloud Console, click "APIs & Services" → "Library"
2. Search for "Google+ API"
3. Click "Google+ API" → "Enable"

### Step 3: Configure OAuth Consent Screen
1. Click "APIs & Services" → "OAuth consent screen"
2. Choose "External" (for testing with real users)
3. Click "Create"
4. Fill in required fields:
   - **App name:** Tarantuverse
   - **User support email:** your-email@gmail.com
   - **Developer contact:** your-email@gmail.com
5. Click "Save and Continue"
6. **Scopes:** Click "Add or Remove Scopes"
   - Select: `...auth/userinfo.email`
   - Select: `...auth/userinfo.profile`
7. Click "Save and Continue"
8. **Test users:** Add your email (for testing)
9. Click "Save and Continue" → "Back to Dashboard"

### Step 4: Create OAuth 2.0 Credentials
1. Click "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: **Web application**
4. Name: `Tarantuverse Web App`
5. **Authorized JavaScript origins:**
   - `http://localhost:3000` (development)
   - `https://tarantuverse.com` (production - add later)
6. **Authorized redirect URIs:**
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://tarantuverse.com/api/auth/callback/google` (production - add later)
7. Click "Create"
8. **IMPORTANT:** Copy your credentials:
   - Client ID: `1234567890-abc...apps.googleusercontent.com`
   - Client Secret: `GOCSPX-abc123...`

### Step 5: Add Credentials to Web App
1. Navigate to: `apps/web/`
2. Create `.env.local` file (copy from `.env.example`):
   ```bash
   cp .env.example .env.local
   ```
3. Edit `.env.local` and add your Google credentials:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8000
   
   NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
   NEXTAUTH_URL=http://localhost:3000
   
   GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
   ```
4. Generate `NEXTAUTH_SECRET`:
   ```bash
   openssl rand -base64 32
   ```
   Or use online generator: https://generate-secret.vercel.app/32

### Step 6: Test OAuth Flow
1. Start backend API:
   ```bash
   cd apps/api
   uvicorn app.main:app --reload
   ```
2. Start web app:
   ```bash
   cd apps/web
   pnpm dev
   ```
3. Open browser: `http://localhost:3000/login`
4. Click "Continue with Google"
5. Sign in with your Google account
6. You should be redirected back to the app and logged in!

### Step 7: Verify in Database
1. Connect to your Neon database
2. Check users table:
   ```sql
   SELECT id, email, username, oauth_provider, oauth_id 
   FROM users 
   WHERE oauth_provider = 'google';
   ```
3. You should see your new OAuth user!

## 📱 Mobile OAuth Setup (Additional Steps)

### For Expo Go Testing:
1. In Google Cloud Console → Credentials
2. Create another OAuth client:
   - Type: **Android** (for Expo Go)
   - Package name: `host.exp.exponent`
   - SHA-1: Get from Expo with `expo credentials:manager`
3. Create another OAuth client:
   - Type: **iOS** (for Expo Go)
   - Bundle ID: `host.exp.Exponent`
4. Add credentials to mobile app:
   ```bash
   cd apps/mobile
   # Add to .env or app.config.js
   ```

### For Production App:
1. Create Android OAuth client:
   - Package name: `com.tarantuverse.app`
   - SHA-1: From your release keystore
2. Create iOS OAuth client:
   - Bundle ID: `com.tarantuverse.app`

## 🚨 Common Issues

### "redirect_uri_mismatch" Error
- **Problem:** Redirect URI doesn't match what's in Google Console
- **Fix:** Double-check the URI in Google Console matches exactly:
  - `http://localhost:3000/api/auth/callback/google` (no trailing slash!)

### "OAuth Error: Configuration Error"
- **Problem:** Missing or incorrect environment variables
- **Fix:** Check `.env.local` has all required variables
  - Run: `printenv | grep GOOGLE` to verify they're loaded

### "Invalid Client" Error  
- **Problem:** Incorrect Client ID or Secret
- **Fix:** Copy credentials again from Google Console
  - Make sure no extra spaces or quotes

### OAuth Works Locally But Not in Production
- **Problem:** Missing production redirect URI
- **Fix:** Add production URL to Google Console:
  - `https://your-domain.com/api/auth/callback/google`

### Session Not Persisting
- **Problem:** `NEXTAUTH_SECRET` missing or changes between restarts
- **Fix:** 
  - Generate a stable secret and add to `.env.local`
  - Never commit `.env.local` to git!

## 🔐 Security Best Practices

✅ **DO:**
- Use HTTPS in production
- Keep Client Secret secure (never commit to git)
- Rotate secrets periodically
- Use environment variables
- Enable 2FA on your Google account

❌ **DON'T:**
- Commit `.env.local` to version control
- Share Client Secret publicly
- Use the same credentials for dev and prod
- Hardcode credentials in your code

## 📊 Testing Checklist

- [ ] Google OAuth sign-in works locally
- [ ] New user created in database with `oauth_provider='google'`
- [ ] User has auto-generated username
- [ ] User's display name and avatar are set
- [ ] Returning user can sign in (doesn't create duplicate)
- [ ] Session persists after page refresh
- [ ] Sign out works correctly
- [ ] Existing email+password user can link Google account

## 🎯 Next Steps

After Google OAuth works:
1. ✅ Test on production (deploy and update redirect URIs)
2. ⏳ Set up Apple OAuth (optional but recommended for iOS)
3. ⏳ Implement mobile OAuth with Expo AuthSession
4. ⏳ Add account linking UI (link Google to existing account)
5. ⏳ Add OAuth to mobile app

## 📞 Support

If you encounter issues:
1. Check Google Cloud Console logs
2. Check browser console for errors
3. Check API logs: `cd apps/api && tail -f logs.txt`
4. Verify environment variables are loaded
5. Test with a fresh incognito/private browser window

---

**Estimated Time:** 15-20 minutes  
**Difficulty:** Easy  
**Status:** Backend ✅ | Web Frontend ✅ | Mobile ⏳
