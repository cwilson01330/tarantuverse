# 🧪 OAuth Testing Guide - Ready to Test!

## ✅ Google OAuth Credentials Configured!

Your Google OAuth credentials have been added to:
- `apps/web/.env.local` ✅
- `apps/api/.env` ✅
- NextAuth Secret generated and configured ✅

**Note:** Credentials are stored locally in `.env` files (not committed to git for security).

## 🚀 Quick Test (5 minutes)

### Step 1: Start the Backend API
```bash
cd apps/api
uvicorn app.main:app --reload
```
Expected output:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

### Step 2: Start the Web App
Open a **new terminal**:
```bash
cd apps/web
pnpm dev
```
Expected output:
```
  ▲ Next.js 14.2.16
  - Local:        http://localhost:3000
  - Ready in 2.5s
```

### Step 3: Test OAuth Flow
1. Open browser: **http://localhost:3000/login**
2. You should see:
   - Email/password form (existing)
   - "Continue with Google" button (NEW! 🎉)
   - "Continue with Apple" button (NEW!)
3. Click **"Continue with Google"**
4. Google sign-in popup should appear
5. Sign in with your Google account
6. You should be redirected back to http://localhost:3000
7. You're now logged in! ✅

### Step 4: Verify in Database
Check if your OAuth user was created:

**Option A: In Render Dashboard**
1. Go to: https://dashboard.render.com/
2. Navigate to your database → Shell
3. Run:
```sql
SELECT id, email, username, display_name, oauth_provider, oauth_id 
FROM users 
WHERE oauth_provider = 'google'
ORDER BY created_at DESC 
LIMIT 5;
```

**Option B: Local DB Client**
```bash
# If using psql
psql "postgresql://tarantuverse_db_user:tNu9n8HJdIPcOINNNKGj8kUb98Hn9OYA@dpg-csla7tt2ng1s73f66s60-a.oregon-postgres.render.com/tarantuverse_db"
```

### What to Look For:
✅ New user created with:
- `oauth_provider = 'google'`
- `oauth_id = '[your-google-id]'`
- `username` auto-generated (e.g., `john_doe` or `john_doe1` if taken)
- `display_name` from Google (your name)
- `avatar_url` from Google profile picture
- `hashed_password = NULL` (OAuth users don't have passwords)

## 🐛 Troubleshooting

### "OAuth Error: Configuration Error"
**Problem:** NextAuth can't find environment variables  
**Fix:**
```bash
# Verify .env.local exists
ls apps/web/.env.local

# Restart web server
cd apps/web
pnpm dev
```

### "redirect_uri_mismatch"
**Problem:** Google Console redirect URI doesn't match  
**Fix:**
1. Go to: https://console.cloud.google.com/
2. Navigate to: APIs & Services → Credentials
3. Click your OAuth client
4. Under "Authorized redirect URIs", verify:
   - `http://localhost:3000/api/auth/callback/google`
5. Save changes
6. Wait 5 minutes for Google to propagate changes

### Google Sign-In Button Doesn't Appear
**Problem:** Missing OAuth component in login page  
**Fix:**
1. Check if OAuthButtons component is imported in login page
2. Location: `apps/web/src/app/login/page.tsx`
3. Should include: `<OAuthButtons />`

### Backend OAuth Endpoint Not Found
**Problem:** API doesn't have OAuth routes registered  
**Fix:**
```bash
cd apps/api
# Check if auth router includes oauth.py imports
cat app/routers/auth.py | grep oauth
```

### Session Not Persisting
**Problem:** NEXTAUTH_SECRET missing or incorrect  
**Fix:**
```bash
# Regenerate secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Add to apps/web/.env.local as NEXTAUTH_SECRET
```

## 📊 Test Checklist

### Basic OAuth Flow
- [ ] Google sign-in button appears on login page
- [ ] Clicking button opens Google popup
- [ ] Can sign in with Google account
- [ ] Redirected back to app after auth
- [ ] User appears logged in (check header/nav)
- [ ] New user created in database with `oauth_provider='google'`

### User Creation
- [ ] Username auto-generated from email
- [ ] Display name set from Google profile
- [ ] Avatar URL set from Google profile picture
- [ ] `oauth_id` stored correctly
- [ ] `hashed_password` is NULL

### Session Management
- [ ] Session persists after page refresh
- [ ] User can navigate to protected routes
- [ ] Sign out button works
- [ ] After sign out, redirected to login

### Existing User Linking
- [ ] Create user with email+password first
- [ ] Sign in with Google using SAME email
- [ ] OAuth info added to existing user (no duplicate created)
- [ ] Can now log in with either method

### Backend API
- [ ] POST /auth/oauth/google endpoint returns token
- [ ] Response includes: `access_token`, `user`, `is_new_user`
- [ ] Backend token works for authenticated requests
- [ ] No errors in API logs

## 🎯 Next Steps After Testing

Once OAuth works locally:

1. **Deploy Backend Changes**
   ```bash
   # In Render dashboard, go to API service → Shell
   cd apps/api
   pip install -r requirements.txt
   alembic upgrade head
   ```

2. **Update Production Environment Variables**
   - Add to Render dashboard (apps/api):
     - `GOOGLE_CLIENT_ID`
     - `GOOGLE_CLIENT_SECRET`
     - `GOOGLE_REDIRECT_URI=https://tarantuverse.com/api/auth/callback/google`

3. **Update Google Console for Production**
   - Add production redirect URI:
     - `https://tarantuverse.com/api/auth/callback/google`

4. **Deploy Web App**
   ```bash
   git push
   # Vercel auto-deploys
   ```

5. **Add Environment Variables to Vercel**
   - Go to: Vercel Dashboard → Settings → Environment Variables
   - Add all OAuth variables from `.env.local`

6. **Test on Production**
   - Visit: https://tarantuverse.com/login
   - Test Google sign-in
   - Verify user created in production database

## 🎉 Success Criteria

You'll know OAuth is working when:
- ✅ Google sign-in button appears
- ✅ Clicking button opens Google auth
- ✅ After signing in with Google, you're logged into the app
- ✅ New user appears in database with `oauth_provider='google'`
- ✅ No errors in browser console or API logs
- ✅ Session persists across page refreshes

---

**Status:** Ready to Test! 🚀  
**Time to Complete:** 5 minutes  
**Files Modified:**
- ✅ `apps/web/.env.local` - OAuth credentials added
- ✅ `apps/api/.env` - OAuth credentials added  
- ✅ NextAuth secret generated and configured

**Ready to test? Run the commands in Step 1 and Step 2, then visit http://localhost:3000/login!** 🎯
