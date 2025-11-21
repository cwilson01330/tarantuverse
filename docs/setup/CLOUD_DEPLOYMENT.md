# Cloud Deployment - Most Cost-Effective Options

This guide covers the **cheapest ways to test and deploy Tarantuverse** in the cloud.

## 🎯 Recommended Free/Low-Cost Stack

### **Total Cost: $0-5/month for testing**

| Service | Provider | Cost | Notes |
|---------|----------|------|-------|
| **Backend API** | Render Free Tier | **$0** | 750 hours/month free |
| **Database** | Neon (PostgreSQL) | **$0** | Free tier with 3GB storage |
| **Web App** | Vercel | **$0** | Unlimited for personal projects |
| **Mobile App** | Expo EAS | **$0** | Free builds & updates |
| **File Storage** | Cloudflare R2 | **$0** | 10GB free storage/month |

---

## 📦 Step-by-Step Deployment

### 1. Database - Neon (PostgreSQL)

**Why Neon?** Free PostgreSQL with auto-scaling, no credit card required.

**Setup:**
```bash
# 1. Sign up at https://neon.tech (free, no CC)
# 2. Create a new project
# 3. Copy the connection string

# Example connection string:
postgresql://username:password@ep-cool-name.us-east-2.aws.neon.tech/neondb
```

**Update .env:**
```bash
DATABASE_URL=postgresql://username:password@ep-cool-name.us-east-2.aws.neon.tech/neondb
```

**Free Tier Limits:**
- 3GB storage
- 1 project
- Auto-suspend after 5 min inactivity (perfect for testing)
- Unlimited compute hours

**Alternatives:**
- **Supabase** - Free PostgreSQL + Auth ($0, 500MB)
- **Railway** - Free PostgreSQL ($5/month after trial ends)

---

### 2. Backend API - Render

**Why Render?** 750 free hours/month, auto-deploys from GitHub.

**Setup:**
```bash
# 1. Push code to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo>
git push -u origin main

# 2. Go to https://render.com
# 3. Click "New +" → "Web Service"
# 4. Connect GitHub repo
# 5. Configure:
```

**Render Configuration:**
- **Name**: `tarantuverse-api`
- **Environment**: `Python 3`
- **Build Command**: `pip install -r apps/api/requirements.txt`
- **Start Command**: `cd apps/api && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Root Directory**: Leave empty or use `apps/api`

**Environment Variables:**
```
DATABASE_URL=<your-neon-connection-string>
API_SECRET_KEY=<generate-random-secret>
CORS_ORIGINS=https://your-vercel-app.vercel.app
```

**Free Tier Limits:**
- 750 hours/month
- Spins down after 15 min inactivity
- 512MB RAM
- Slower cold starts (~30 seconds)

**Alternatives:**
- **Railway** - $5/month after $5 free credit
- **Fly.io** - Free tier with 3 VMs
- **Koyeb** - Free tier with auto-sleep

---

### 3. Web App - Vercel

**Why Vercel?** Built by Next.js creators, unlimited free deployments.

**Setup:**
```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Deploy from project root
cd apps/web
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? Your account
# - Link to existing project? No
# - Project name: tarantuverse
# - Directory: ./ (default)
```

**Environment Variables (in Vercel dashboard):**
```
NEXT_PUBLIC_API_URL=https://tarantuverse-api.onrender.com
```

**Free Tier Limits:**
- Unlimited deployments
- 100GB bandwidth/month
- Automatic SSL
- Global CDN

**Alternatives:**
- **Netlify** - Similar free tier
- **Cloudflare Pages** - Unlimited bandwidth

---

### 4. Mobile App - Expo EAS

**Why EAS?** Free builds for personal projects, OTA updates.

**Setup:**
```bash
# 1. Install EAS CLI
npm install -g eas-cli

# 2. Login/signup
cd apps/mobile
eas login

# 3. Configure project
eas build:configure

# 4. Build (free for up to 30 builds/month)
eas build --platform android --profile preview
eas build --platform ios --profile preview

# 5. Share build with testers
# iOS: TestFlight
# Android: Download APK directly
```

**Environment Variables:**
Update `app.json`:
```json
{
  "expo": {
    "extra": {
      "apiUrl": "https://tarantuverse-api.onrender.com"
    }
  }
}
```

**Free Tier:**
- 30 builds/month
- Unlimited OTA updates
- Unlimited users

**Alternatives:**
- **Local builds** - Completely free with `eas build --local`

---

### 5. File Storage - Cloudflare R2

**Why R2?** No egress fees, 10GB free storage.

**Setup:**
```bash
# 1. Sign up at https://dash.cloudflare.com
# 2. Go to R2 → Create bucket
# 3. Create API token with R2 edit permissions
```

**Environment Variables:**
```bash
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=tarantuverse-uploads
```

**Free Tier:**
- 10GB storage
- 1 million Class A operations/month
- 10 million Class B operations/month
- **No egress fees** (unlike S3)

**Alternatives:**
- **AWS S3** - Free tier: 5GB, 20,000 GET requests, 2,000 PUT
- **Backblaze B2** - 10GB free

---

## 💰 Cost Comparison

### Free Tier (Recommended for Testing)
```
Database:     Neon          $0/month
API:          Render        $0/month
Web:          Vercel        $0/month
Mobile:       EAS           $0/month
Storage:      Cloudflare R2 $0/month
───────────────────────────────────
TOTAL:                      $0/month
```

### Paid Tier (Small Scale - 100 users)
```
Database:     Neon Pro      $19/month
API:          Render        $7/month
Web:          Vercel        $0/month (still free)
Mobile:       EAS           $0/month (still free)
Storage:      Cloudflare R2 ~$1/month
───────────────────────────────────
TOTAL:                      $27/month
```

### Alternative All-in-One (Supabase)
```
Supabase Pro (DB + Auth + Storage): $25/month
Vercel (Web):                       $0/month
Render (API):                       $7/month
EAS (Mobile):                       $0/month
───────────────────────────────────
TOTAL:                              $32/month
```

---

## 🚀 Quick Deploy Script

Create `scripts/deploy.sh`:

```bash
#!/bin/bash

echo "🚀 Deploying Tarantuverse..."

# 1. Deploy API to Render (auto-deploys from git push)
echo "📦 Pushing to GitHub..."
git add .
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M')"
git push origin main

# 2. Deploy web to Vercel
echo "🌐 Deploying web app..."
cd apps/web
vercel --prod
cd ../..

# 3. Build mobile app (optional)
echo "📱 Building mobile app..."
cd apps/mobile
eas update --branch production
cd ../..

echo "✅ Deployment complete!"
echo "API: https://tarantuverse-api.onrender.com"
echo "Web: https://tarantuverse.vercel.app"
```

---

## 🔧 Database Migrations in Production

```bash
# Connect to Neon database
DATABASE_URL="postgresql://..." alembic upgrade head

# Or use Render's built-in shell
# In Render dashboard: Shell → Run command
cd apps/api
alembic upgrade head
```

---

## 📊 Monitoring (Free Tier)

### Sentry (Error Tracking)
- Free tier: 5,000 errors/month
- Sign up: https://sentry.io

### Better Uptime (Uptime Monitoring)
- Free tier: 10 monitors
- Sign up: https://betteruptime.com

---

## ⚡ Performance Tips for Free Tiers

### Render (API)
```python
# Add to main.py - keep instance warm
from fastapi_utils.tasks import repeat_every

@app.on_event("startup")
@repeat_every(seconds=60 * 10)  # Every 10 minutes
async def keep_alive():
    """Ping self to prevent cold starts"""
    # Only in production
    pass
```

### Database Connection Pooling
```python
# In database.py
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=3600,  # Recycle connections after 1 hour
)
```

---

## 🎯 Testing Workflow

**Development:**
```bash
# Local development (free)
docker-compose up -d postgres
pnpm dev
```

**Staging (free tier):**
```bash
# Push to staging branch
git push origin staging

# Render + Vercel auto-deploy
# Access at: https://tarantuverse-staging.vercel.app
```

**Production (free tier or $27/month):**
```bash
# Push to main
git push origin main

# Auto-deploys to production URLs
```

---

## 🔐 Security Checklist

- [ ] Change `API_SECRET_KEY` to a random 32+ character string
- [ ] Enable Render environment variable encryption
- [ ] Use Vercel environment variables (not hardcoded)
- [ ] Set up CORS to only allow your domains
- [ ] Enable database SSL (Neon enables by default)
- [ ] Add rate limiting (use `slowapi` package)

---

## 📈 Scaling Path

When you outgrow free tier:

1. **100-1,000 users**: Upgrade Neon ($19/mo), keep everything else free → **$19/month**
2. **1,000-10,000 users**: Add Render Standard ($7/mo) → **$26/month**
3. **10,000+ users**: Move to Railway/Fly.io with autoscaling → **$50-100/month**

---

## 🆘 Troubleshooting

### Render Cold Starts
Free tier spins down after 15 min. First request takes ~30 seconds.

**Solution:**
- Use cron job to ping every 10 minutes (e.g., cron-job.org)
- Upgrade to Render Starter ($7/mo) for always-on

### Vercel Build Errors
Check build logs in Vercel dashboard.

**Common fixes:**
```bash
# Clear cache
vercel --force

# Check environment variables are set
```

### Database Connection Issues
Neon auto-suspends after 5 min of inactivity.

**Solution:**
- Add `pool_pre_ping=True` in SQLAlchemy config
- First query after suspend takes 2-3 seconds (normal)

---

## 📚 Additional Resources

- **Render Docs**: https://render.com/docs
- **Neon Docs**: https://neon.tech/docs
- **Vercel Docs**: https://vercel.com/docs
- **EAS Docs**: https://docs.expo.dev/eas/

---

## ✅ Final Checklist

Before deploying:

- [ ] Update `.env` with production values
- [ ] Run `alembic upgrade head` on production DB
- [ ] Test all API endpoints at `/docs`
- [ ] Verify CORS settings
- [ ] Set up error monitoring (Sentry)
- [ ] Create first user via `/api/v1/auth/register`
- [ ] Test web app can connect to API
- [ ] Build and test mobile app

---

**🎉 You now have a production-ready app for $0/month!**
