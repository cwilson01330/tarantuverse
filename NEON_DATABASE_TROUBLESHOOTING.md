# Neon Database Connection Troubleshooting

## Error: "Control plane request failed"

This error occurs when trying to connect to your Neon PostgreSQL database. It typically means the database is **suspended** or **sleeping**.

## Quick Fix (2 Minutes)

### Step 1: Wake Up Your Neon Database

1. **Go to Neon Console:** https://console.neon.tech
2. **Select your project:** "tarantuverse" (or whatever you named it)
3. **Check the status:**
   - If it says "Suspended" or "Idle" → Click **"Wake up"** or **"Resume"**
   - If it says "Active" → The issue might be temporary, wait 30 seconds

4. **Wait 30 seconds** for the database to fully activate

### Step 2: Test the Connection

Once deployed to Render, run this in the **Render Shell**:

```bash
python test_db_connection.py
```

This will test the connection with automatic retries and show detailed diagnostics.

### Step 3: Run the Seed Script

If the test passes, run:

```bash
python seed_species_simple.py
```

The script now has **automatic retry logic** (3 attempts with 10-second delays).

---

## Why This Happens

### Neon Free Tier Behavior
- **Auto-suspend:** After **5 minutes** of inactivity
- **Auto-pause:** After **7 days** of no activity
- **Wake time:** Takes **10-30 seconds** to resume

When your database is suspended:
- ✅ Data is preserved (no data loss)
- ✅ Free to use (no charges)
- ⏳ Needs to "wake up" before accepting connections

---

## Solutions (By Scenario)

### Scenario 1: Running Seed Script in Render Shell

**Problem:** Script fails immediately with "Control plane request failed"

**Solution:**
1. Wake database in Neon console (see Step 1 above)
2. Run `python test_db_connection.py` to verify
3. Run `python seed_species_simple.py` (now has retry logic)

---

### Scenario 2: API Requests Timing Out

**Problem:** First API request after inactivity is slow or fails

**Solution (2 options):**

#### Option A: Accept the Wake Delay
- First request after inactivity takes 10-30 seconds
- Subsequent requests are fast
- This is normal for free tier

#### Option B: Keep Database Active
Add a cron job to ping your API every 4 minutes:

**On Render:**
1. Go to your web service settings
2. Add a **Cron Job** (if available on free tier)
3. Schedule: `*/4 * * * *` (every 4 minutes)
4. Command: `curl https://tarantuverse-api.onrender.com/health`

**External Services (Free):**
- **Cron-job.org:** https://cron-job.org
- **UptimeRobot:** https://uptimerobot.com
- Set to ping your `/health` endpoint every 4 minutes

---

### Scenario 3: Persistent Connection Errors

**Problem:** Database won't wake up or stay connected

**Possible Causes:**
1. **Neon outage** - Check https://status.neon.tech
2. **Connection limit reached** - Free tier has limited connections
3. **Wrong credentials** - DATABASE_URL changed

**Diagnostic Steps:**

1. **Check Neon Status:**
   - Go to https://status.neon.tech
   - Check for ongoing incidents

2. **Verify Connection String:**
   - In Render dashboard, check your DATABASE_URL environment variable
   - In Neon console, get the latest connection string
   - Make sure they match

3. **Check Connection Usage:**
   - Neon free tier: **100 connections max**
   - Go to Neon console → Monitoring → Connection stats
   - If at limit, restart your Render services

4. **Test Locally (if possible):**
   ```bash
   # Get your DATABASE_URL from Render
   export DATABASE_URL="postgresql://..."
   python test_db_connection.py
   ```

---

## Connection String Options

### Pooler (Current) - Recommended for API
```
postgresql://user:pass@ep-xxx-pooler.c-2.us-east-1.aws.neon.tech:5432/db?sslmode=require
```
- ✅ Better for web applications (connection pooling)
- ⚠️ May need wake time after suspension

### Direct Connection - Better for Scripts
```
postgresql://user:pass@ep-xxx.c-2.us-east-1.aws.neon.tech:5432/db?sslmode=require
```
- ✅ More reliable for one-off scripts
- ⚠️ No pooling (not ideal for API)

**To get direct connection:**
1. Neon console → Your project → Connection Details
2. Toggle "Pooled connection" to OFF
3. Copy the direct connection string

---

## Script Improvements Made

### seed_species_simple.py
```python
# Now includes:
- 3 automatic retry attempts
- 10-second delay between retries
- Clear error messages with troubleshooting steps
- Instructions to wake database
```

### test_db_connection.py (NEW)
```python
# Diagnostic tool that:
- Tests database connection
- Shows PostgreSQL version
- Counts species in database
- Provides detailed error messages
- Suggests specific fixes
```

---

## Expected Behavior After Fix

### First Run (Database Asleep)
```
🔌 Connecting to database...
⚠️  Connection attempt 1 failed: Control plane request failed
⏳ Waiting 10 seconds for database to wake up...
⏳ Connection attempt 2...
✅ Connected! Current species in database: 13
```

### Subsequent Runs (Database Awake)
```
🔌 Connecting to database...
✅ Connected! Current species in database: 13
...
✅ Successfully added 6 species!
⏭️  Skipped 13 existing species
📊 Total species in database: 19
```

---

## Upgrading to Paid Tier (If Needed)

If you need **always-on database** without suspensions:

### Neon Pro ($19/month)
- No auto-suspend
- 1 compute endpoint always active
- Unlimited storage (up to quota)
- Better for production

### Alternative: Vercel Postgres ($20/month)
- Integrated with Vercel deployment
- No suspend (always active)
- Simple dashboard

### Alternative: Supabase ($25/month Pro)
- PostgreSQL + Auth + Storage
- No suspend on paid tier
- Extra features (Auth, Realtime)

---

## Summary

**For Development (Current Setup):**
- ✅ Free tier is perfect
- ✅ Just wake database when needed
- ✅ Use retry logic in scripts

**For Production (Future):**
- Consider paid tier if you need:
  - No cold starts
  - More connections
  - Better performance
  - 24/7 availability

---

## Quick Reference Commands

### In Render Shell:
```bash
# Test connection
python test_db_connection.py

# Run seed script (with retries)
python seed_species_simple.py

# Check if API is running
curl https://tarantuverse-api.onrender.com/health
```

### Get Current Species Count:
```bash
# In Render Shell
python -c "from app.database import SessionLocal; from app.models.species import Species; db = SessionLocal(); print(f'Species: {db.query(Species).count()}')"
```

---

**Last Updated:** After adding connection retry logic (commit f23e5ad)
