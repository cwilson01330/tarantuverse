# Troubleshooting: Photos Upload But Don't Display

## Quick Diagnostic Steps

### 1️⃣ Check Storage Configuration (Do this first!)

Open this URL in your browser:
```
https://tarantuverse-api.onrender.com/api/v1/storage-info
```

You should see something like:
```json
{
  "using_r2": true,
  "bucket_name": "tarantuverse-photos",
  "public_url_base": "https://pub-xxxxx.r2.dev",
  "r2_account_id_set": true,
  "r2_access_key_set": true,
  "r2_secret_key_set": true,
  "r2_bucket_name": "tarantuverse-photos",
  "r2_public_url": "https://pub-xxxxx.r2.dev"
}
```

**If `using_r2` is `false`:**
- ❌ R2 credentials not configured correctly
- Check Render environment variables

**If `public_url_base` is empty or null:**
- ❌ R2_PUBLIC_URL not set
- This is why images don't display!

### 2️⃣ Check Render Logs

After uploading a photo, check Render logs for:

**Success:**
```
✅ Using Cloudflare R2 storage: tarantuverse-photos
📸 Photo uploaded - URL: https://pub-xxxxx.r2.dev/photos/abc123.jpg
🖼️  Thumbnail created - URL: https://pub-xxxxx.r2.dev/thumbnails/thumb_abc123.jpg
```

**Problem:**
```
⚠️  Using local filesystem storage (development mode)
```
= R2 not configured

### 3️⃣ Check R2 Bucket Settings

1. Go to Cloudflare Dashboard → R2
2. Click on your `tarantuverse-photos` bucket
3. Go to **Settings** tab
4. Check **Public Access**: Should say "**Allowed**"
5. If not, click "Allow Access"

### 4️⃣ Get Your R2 Public URL

If you don't have R2_PUBLIC_URL set:

1. In your R2 bucket, go to **Settings**
2. Look for **Public R2.dev Bucket URL**
3. Click "**Allow Access**" if needed
4. Copy the URL (looks like: `https://pub-a1b2c3d4.r2.dev`)
5. Add to Render environment variables:
   ```
   R2_PUBLIC_URL=https://pub-a1b2c3d4.r2.dev
   ```

**Important:** Do NOT include trailing slash!
- ✅ `https://pub-xxx.r2.dev`
- ❌ `https://pub-xxx.r2.dev/`

### 5️⃣ Verify File Upload to R2

1. Go to Cloudflare Dashboard → R2 → tarantuverse-photos
2. Click "**Browse**" to see files
3. After uploading a photo, you should see:
   - `photos/abc-123-def.jpg`
   - `thumbnails/thumb_abc-123-def.jpg`

If files are NOT there:
- Check API credentials are correct
- Check Render logs for upload errors

### 6️⃣ Test Image URL Directly

From Render logs, copy a photo URL and paste in browser:
```
https://pub-xxxxx.r2.dev/photos/abc123.jpg
```

**If image loads:** ✅ R2 is working, issue is in mobile app
**If 403 Forbidden:** ❌ Bucket not public
**If 404 Not Found:** ❌ File wasn't uploaded or wrong URL

## Common Issues & Fixes

### Issue 1: "using_r2": false

**Cause:** Environment variables not set correctly

**Fix:**
1. Go to Render Dashboard
2. Your API service → Environment
3. Verify ALL 5 variables are set:
   - R2_ACCOUNT_ID
   - R2_ACCESS_KEY_ID
   - R2_SECRET_ACCESS_KEY
   - R2_BUCKET_NAME
   - R2_PUBLIC_URL
4. Save Changes (triggers redeploy)

### Issue 2: "public_url_base": null

**Cause:** R2_PUBLIC_URL not set

**Fix:**
1. Enable public access on R2 bucket
2. Get public R2.dev URL from Cloudflare
3. Add to Render: `R2_PUBLIC_URL=https://pub-xxx.r2.dev`

### Issue 3: Images Upload but 403 Error

**Cause:** Bucket is private

**Fix:**
1. Cloudflare → R2 → Your Bucket
2. Settings → Public Access
3. Click "Allow Access"
4. Try uploading again

### Issue 4: Images Upload to Local Storage

**Cause:** R2 credentials invalid or incomplete

**Fix:**
1. Check /api/v1/storage-info shows all credentials set
2. Verify Account ID, Access Key, Secret are correct
3. Check bucket name matches exactly
4. Redeploy after fixing

### Issue 5: Wrong URLs in Database

**Cause:** R2_PUBLIC_URL was wrong when photos uploaded

**Fix:**
1. Fix R2_PUBLIC_URL in Render
2. Delete old photos
3. Re-upload photos (will use correct URL)

OR manually update database:
```sql
UPDATE photos 
SET url = REPLACE(url, 'old-url', 'https://pub-xxx.r2.dev'),
    thumbnail_url = REPLACE(thumbnail_url, 'old-url', 'https://pub-xxx.r2.dev');
```

## Verification Checklist

After fixing, verify:

- [ ] `/api/v1/storage-info` shows `using_r2: true`
- [ ] `public_url_base` has valid URL
- [ ] Render logs show "✅ Using Cloudflare R2 storage"
- [ ] Upload photo - see URLs logged
- [ ] Check R2 bucket - see files uploaded
- [ ] Copy URL from logs - paste in browser - image loads
- [ ] Mobile app displays thumbnails
- [ ] Tap thumbnail - full image opens

## Still Not Working?

### Check Mobile App Network Logs

The mobile app might be getting URLs but failing to load them.

**In Expo:**
1. Upload a photo
2. Check console for photo URLs
3. Try opening URL in mobile browser

### Check CORS (if using custom domain)

If using custom domain on R2:
1. R2 bucket → Settings → CORS Policy
2. Verify it includes mobile app origins

### Database URLs

Check what's actually saved in database:
1. Look at photo URLs in database
2. Should match format: `https://pub-xxx.r2.dev/photos/filename.jpg`
3. If wrong format, URLs need updating

## Quick Test

Run this sequence:
1. Check `/api/v1/storage-info` - all green?
2. Upload photo from mobile app
3. Check Render logs - see success messages?
4. Check R2 bucket - see new files?
5. Copy photo URL from logs - load in browser?
6. If all yes → issue is mobile app
7. If any no → follow fixes above

## Need More Help?

Share:
1. Output from `/api/v1/storage-info`
2. Render logs after upload
3. Screenshot of R2 bucket showing files
4. Example photo URL from database
