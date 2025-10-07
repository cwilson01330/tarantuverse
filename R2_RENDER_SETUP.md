# Fix: Configure R2 on Render

## ⚠️ Issue
Backend is showing: `⚠️ Using local filesystem storage (development mode)`

This means R2 credentials are not properly configured in Render.

## 🔧 Solution: Set Environment Variables in Render

### Step 1: Go to Render Dashboard
1. Visit https://dashboard.render.com
2. Click on your `tarantuverse-api` service
3. Click on "Environment" in the left sidebar

### Step 2: Add R2 Environment Variables

Click "Add Environment Variable" and add each of these:

#### Required Variables:

**1. R2_ACCOUNT_ID**
```
Key: R2_ACCOUNT_ID
Value: your_cloudflare_account_id
```
*(Find this in Cloudflare dashboard → R2 → Overview)*

**2. R2_ACCESS_KEY_ID**
```
Key: R2_ACCESS_KEY_ID
Value: your_r2_access_key_id
```
*(From your R2 API token)*

**3. R2_SECRET_ACCESS_KEY**
```
Key: R2_SECRET_ACCESS_KEY
Value: your_r2_secret_access_key
```
*(From your R2 API token)*

**4. R2_BUCKET_NAME**
```
Key: R2_BUCKET_NAME
Value: tarantuverse-photos
```
*(Your bucket name - should match what you created)*

**5. R2_PUBLIC_URL**
```
Key: R2_PUBLIC_URL
Value: https://pub-739a81bdc01a40bb8cfce4a58b122d17.r2.dev
```
*(Your R2 public bucket URL - get this from Cloudflare R2 dashboard)*

### Step 3: Save and Redeploy

After adding all variables:
1. Click "Save Changes" (Render will auto-redeploy)
2. Wait for deployment to complete (~2-5 minutes)
3. Check logs for: `✅ Using Cloudflare R2 storage: tarantuverse-photos`

## 📋 Quick Copy-Paste Format

For faster setup, here are the variable names you need:

```
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_URL
```

## 🔍 How to Find Your R2 Credentials

### Account ID:
1. Go to Cloudflare dashboard
2. Click "R2" in the left sidebar
3. Your Account ID is shown at the top of the R2 page

### Access Key & Secret:
1. In Cloudflare dashboard → R2
2. Click "Manage R2 API Tokens" on the right
3. Click "Create API Token"
4. Give it a name (e.g., "Tarantuverse Production")
5. Permissions: "Object Read & Write"
6. Click "Create API Token"
7. **SAVE BOTH VALUES** (you can't see the secret again!)

### Public URL:
1. Go to Cloudflare dashboard → R2
2. Click on your bucket "tarantuverse-photos"
3. Click "Settings" tab
4. Look for "Public R2.dev Bucket URL"
5. If not enabled, click "Allow Access" first
6. Copy the URL (should look like: `https://pub-xxxxx.r2.dev`)

## ✅ Verification

After redeployment, check the Render logs:

### Success ✅
```
✅ Using Cloudflare R2 storage: tarantuverse-photos
```

### Still Failing ❌
```
⚠️ Using local filesystem storage (development mode)
```

If still failing:
1. Double-check all 5 variables are set
2. Verify no typos in variable names (case-sensitive!)
3. Verify no extra spaces in values
4. Make sure secret key is correct (regenerate if needed)
5. Check Render logs for any error messages

## 🧪 Test After Setup

1. Open your mobile or web app
2. Upload a new photo
3. Check the photo URL in the response
4. Should start with: `https://pub-xxxxx.r2.dev/photos/...`
5. Photo should load successfully

## 🚨 Common Issues

### Issue: "Access Denied" errors
**Solution**: Regenerate R2 API token with correct permissions:
- ✅ Object Read & Write
- ✅ Applied to your bucket

### Issue: Still using local storage after setting vars
**Solution**: 
1. Make sure you clicked "Save Changes"
2. Wait for auto-redeploy to complete
3. Check that service restarted (new deployment in logs)

### Issue: Photos upload but don't load
**Solution**: 
1. Check `R2_PUBLIC_URL` is correct
2. Verify bucket has public access enabled
3. Test the public URL in browser directly

## 📝 Example Values (Yours will be different!)

```bash
R2_ACCOUNT_ID=abc123def456
R2_ACCESS_KEY_ID=1234567890abcdef
R2_SECRET_ACCESS_KEY=abcdefghijklmnopqrstuvwxyz123456
R2_BUCKET_NAME=tarantuverse-photos
R2_PUBLIC_URL=https://pub-739a81bdc01a40bb8cfce4a58b122d17.r2.dev
```

## 🎯 Final Checklist

Before continuing:
- [ ] All 5 environment variables added to Render
- [ ] No typos in variable names
- [ ] No extra spaces in values
- [ ] Clicked "Save Changes" in Render
- [ ] Waited for automatic redeployment
- [ ] Checked logs for "✅ Using Cloudflare R2 storage"
- [ ] Tested photo upload
- [ ] Verified photo URL starts with R2 domain
- [ ] Confirmed photo loads in app

---

**Status**: Configuration Required
**Priority**: High (blocking photo features in production)
**Time to Fix**: 5-10 minutes
