# 🚀 OAuth Production Deployment - Quick Guide

## Production URLs
- **API (Render):** https://tarantuverse-api.onrender.com
- **Web (Vercel):** https://tarantuverse.com

---

## Step 1: Update Google Console for Production (5 min)

### Add Production Redirect URIs
1. Go to: **https://console.cloud.google.com/apis/credentials**
2. Click your OAuth client: "Tarantuverse Web App"
3. Under **"Authorized redirect URIs"**, add:
   ```
   https://tarantuverse.com/api/auth/callback/google
   ```
4. Keep the localhost one for development:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
5. Under **"Authorized JavaScript origins"**, add:
   ```
   https://tarantuverse.com
   ```
6. Click **"Save"**
7. ⏰ Wait 5 minutes for Google to propagate changes

---

## Step 2: Deploy Backend to Render (10 min)

### 2A: Update Dependencies
1. Go to: **https://dashboard.render.com/**
2. Navigate to: **tarantuverse-api** service
3. Click **"Shell"** (or SSH)
4. Run:
```bash
cd /opt/render/project/src/apps/api
pip install -r requirements.txt
```

### 2B: Run Database Migration
Still in the Render shell:
```bash
cd /opt/render/project/src/apps/api
alembic upgrade head
```

Expected output:
```
INFO  [alembic.runtime.migration] Running upgrade -> oauth_fields_001, Add OAuth fields to User model
```

### 2C: Add Environment Variables
1. In Render dashboard → **tarantuverse-api** → **Environment**
2. Add these variables (use your actual credentials from `.env.local`):

```
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
GOOGLE_REDIRECT_URI=https://tarantuverse.com/api/auth/callback/google
```

3. Click **"Save Changes"**
4. Service will auto-redeploy (takes ~2 minutes)

### 2D: Verify API Deployment
Once deployed, check:
- Visit: https://tarantuverse-api.onrender.com/docs
- You should see new endpoints:
  - `POST /auth/oauth/google`
  - `POST /auth/oauth/apple`

---

## Step 3: Deploy Web to Vercel (2 min)

### 3A: Push Code (Triggers Auto-Deploy)
```bash
git push origin main
```

Vercel will automatically deploy! ✅

### 3B: Add Environment Variables to Vercel
1. Go to: **https://vercel.com/dashboard**
2. Select: **tarantuverse** project
3. Click: **Settings** → **Environment Variables**
4. Add these variables for **Production** (use your actual credentials from `apps/web/.env.local`):

```
NEXT_PUBLIC_API_URL=https://tarantuverse-api.onrender.com
NEXTAUTH_SECRET=your-nextauth-secret-from-env-local
NEXTAUTH_URL=https://tarantuverse.com
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
```

5. Click **"Save"**
6. **Redeploy** (or wait for auto-deploy to complete)

---

## Step 4: Test on Production (2 min)

### 4A: Test OAuth Flow
1. Open: **https://tarantuverse.com/login**
2. You should see:
   - ✅ "Continue with Google" button
   - ✅ "Continue with Apple" button (may not work yet)
3. Click **"Continue with Google"**
4. Sign in with your Google account
5. You should be redirected back to: https://tarantuverse.com
6. You're logged in! 🎉

### 4B: Verify in Database
Check if your OAuth user was created:
1. Go to Render dashboard → Database → Shell
2. Run:
```sql
SELECT id, email, username, display_name, oauth_provider, oauth_id 
FROM users 
WHERE oauth_provider = 'google'
ORDER BY created_at DESC 
LIMIT 5;
```

You should see your new OAuth user!

---

## 🐛 Quick Troubleshooting

### "redirect_uri_mismatch"
- **Problem:** Google Console redirect URI doesn't match
- **Fix:** Double-check in Google Console:
  - `https://tarantuverse.com/api/auth/callback/google` (exact match, no trailing slash)
- Wait 5 minutes after saving changes

### OAuth Button Doesn't Appear
- **Problem:** Vercel environment variables not set
- **Fix:** 
  1. Check Vercel dashboard → Environment Variables
  2. Redeploy after adding variables
  3. Hard refresh browser: Ctrl+Shift+R

### "Configuration Error"
- **Problem:** Missing environment variables on Vercel
- **Fix:**
  1. Verify all 5 variables are added in Vercel
  2. Redeploy: Vercel dashboard → Deployments → Redeploy
  3. Check deployment logs for errors

### API Returns 500 Error
- **Problem:** Migration not run or dependencies not installed
- **Fix:**
  1. Go to Render shell
  2. Run: `alembic upgrade head`
  3. Run: `pip install -r requirements.txt`
  4. Redeploy service

### "Invalid Client"
- **Problem:** Wrong credentials or not propagated yet
- **Fix:**
  1. Wait 5-10 minutes after updating Google Console
  2. Verify credentials match exactly in Vercel dashboard
  3. Check for extra spaces or quotes

---

## ✅ Success Checklist

- [ ] Google Console updated with production redirect URI
- [ ] Render: Dependencies installed (`pip install -r requirements.txt`)
- [ ] Render: Migration run (`alembic upgrade head`)
- [ ] Render: Environment variables added (Google OAuth credentials)
- [ ] Vercel: Code pushed and auto-deployed
- [ ] Vercel: Environment variables added (all 5 variables)
- [ ] Test: Visit https://tarantuverse.com/login
- [ ] Test: "Continue with Google" button appears
- [ ] Test: Click button, sign in with Google
- [ ] Test: Redirected back to app, logged in
- [ ] Verify: New user in database with `oauth_provider='google'`

---

## 📊 Expected Timeline

- ⏰ Google Console update: 5 minutes
- ⏰ Render deployment: 5 minutes
- ⏰ Vercel deployment: 2 minutes
- ⏰ Testing: 2 minutes
- **Total: ~15 minutes**

---

## 🎯 After Testing Works

Once OAuth works on production:

1. **Test with a friend** - Have them sign in with their Google account
2. **Check for duplicate users** - Verify same email doesn't create duplicates
3. **Test logout** - Sign out and sign back in
4. **Mobile OAuth** - Implement Expo AuthSession for mobile app
5. **Apple OAuth** - Set up Sign In with Apple (optional)

---

## 📝 Quick Commands Summary

```bash
# 1. Push code to trigger Vercel deploy
git push origin main

# 2. In Render Shell:
cd /opt/render/project/src/apps/api
pip install -r requirements.txt
alembic upgrade head

# 3. Test
open https://tarantuverse.com/login
```

---

**Ready to deploy? Follow steps 1-4 above!** 🚀

**Estimated time:** 15 minutes  
**Difficulty:** Easy (mostly copy-paste)
