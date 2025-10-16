# OAuth Deployment - Quick Reference Card

## 🎯 Your Credentials
**Stored locally in:**
- `apps/web/.env.local`
- `apps/api/.env`

**You'll need to copy these to Render and Vercel** (get them from your local `.env.local` files)

## 📋 Deployment Checklist

### 1. Google Console (5 min)
- [ ] Go to: https://console.cloud.google.com/apis/credentials
- [ ] Add redirect URI: `https://tarantuverse.com/api/auth/callback/google`
- [ ] Save and wait 5 minutes

### 2. Render - Backend (5 min)
- [ ] Go to: https://dashboard.render.com/
- [ ] Open tarantuverse-api → Shell
- [ ] Run: `cd /opt/render/project/src/apps/api && pip install -r requirements.txt`
- [ ] Run: `alembic upgrade head`
- [ ] Add environment variables (see credentials above)
- [ ] Service auto-redeploys

### 3. Vercel - Frontend (2 min)
- [ ] Code already pushed ✅ (Vercel auto-deploying now)
- [ ] Go to: https://vercel.com/dashboard
- [ ] Open tarantuverse → Settings → Environment Variables
- [ ] Add 5 variables (see credentials above):
  - NEXT_PUBLIC_API_URL
  - NEXTAUTH_SECRET  
  - NEXTAUTH_URL
  - GOOGLE_CLIENT_ID
  - GOOGLE_CLIENT_SECRET
- [ ] Redeploy

### 4. Test (2 min)
- [ ] Visit: https://tarantuverse.com/login
- [ ] See "Continue with Google" button
- [ ] Click and sign in
- [ ] Redirected back and logged in ✅

## 🚨 If Something Breaks

**"redirect_uri_mismatch"**
→ Wait 5 more minutes for Google to propagate

**OAuth button missing**
→ Check Vercel env vars, redeploy

**500 error**
→ Check Render logs, run migration again

## ✅ Success = 
You can sign in with Google on https://tarantuverse.com/login

---
See `PRODUCTION_OAUTH_DEPLOY.md` for full details.
