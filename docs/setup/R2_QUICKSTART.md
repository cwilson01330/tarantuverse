# Quick Start: Cloudflare R2 Integration

## What I Just Built

✅ **Storage Service Abstraction Layer**
- Automatically uses R2 if configured, falls back to local storage
- Handles photo uploads, thumbnail generation, and deletions
- Works with both development (local) and production (R2)

✅ **Updated Photo Router**
- Now uses the storage service instead of direct filesystem
- Cleaner code, easier to maintain
- No breaking changes to API endpoints

✅ **Configuration Ready**
- Added R2 settings to config.py
- Created .env.example template
- boto3 already installed (S3-compatible API)

## Next Steps (Follow CLOUDFLARE_R2_SETUP.md)

### 1️⃣ Create R2 Bucket (5 minutes)
```
1. Go to https://dash.cloudflare.com
2. Navigate to R2
3. Click "Purchase R2" (free tier available)
4. Create bucket: "tarantuverse-photos"
5. Enable public access in Settings
```

### 2️⃣ Get API Credentials (2 minutes)
```
1. In R2 dashboard, click "Manage R2 API Tokens"
2. Create token with "Object Read & Write" permissions
3. Save these values:
   - Account ID:809935ae1f0e5bae17b468ef2475fc11
   - Access Key ID:744ed65fc86f7f602f560c61e735722d
   - Secret Access Key:a7e961a4e7aa891b0171eb1622b497d61e0cdbd275cab269af77da99cf59645a
   - Token Value:o1PWDrEJbPklrTmZu5VedAO4Y63vePywAXm9H-aF
   - Endpoint: https://809935ae1f0e5bae17b468ef2475fc11.r2.cloudflarestorage.com
   
```

### 3️⃣ Configure Render (3 minutes)
```
Go to Render dashboard → Your API service → Environment
Add these variables:
   R2_ACCOUNT_ID=your-account-id
   R2_ACCESS_KEY_ID=your-key-id
   R2_SECRET_ACCESS_KEY=your-secret-key
   R2_BUCKET_NAME=tarantuverse-photos
   R2_PUBLIC_URL=https://pub-[hash].r2.dev

Click "Save Changes" (will auto-deploy)
```

### 4️⃣ Test It! (2 minutes)
```
1. Open your mobile app
2. Navigate to a tarantula
3. Tap "Photo" button
4. Upload a photo
5. Check Cloudflare R2 dashboard - photo should be there!
```

## How It Works

### Without R2 (Current/Default)
```python
# In apps/api/app/services/storage.py
if not R2 configured:
    → Uses local filesystem
    → Saves to uploads/photos/
    → Thumbnails in uploads/thumbnails/
    → URLs: /uploads/photos/filename.jpg
```

### With R2 (After Setup)
```python
if R2 configured:
    → Uploads to Cloudflare R2
    → Saves to tarantuverse-photos/photos/
    → Thumbnails in tarantuverse-photos/thumbnails/
    → URLs: https://pub-xxx.r2.dev/photos/filename.jpg
```

## Features

✨ **Automatic Switching**
- No code changes needed
- Set R2 env vars → uses R2
- No R2 env vars → uses local storage

✨ **Thumbnail Generation**
- Automatically creates 300x300 thumbnails
- Maintains aspect ratio
- Optimized JPEG quality (85%)

✨ **Error Handling**
- Graceful fallbacks
- Detailed logging
- Database rollback on upload failure

✨ **Cost Efficient**
- FREE egress (no bandwidth charges!)
- $0.015/GB storage
- First 10GB free

## Cost Example

**1,000 photos (2MB each = 2GB total):**
- Storage: $0.03/month
- Bandwidth: $0 (free!)
- Operations: ~$0.01/month
- **Total: ~$0.04/month** 🎉

Compare to AWS S3:
- Storage: $0.05/month
- Bandwidth: $2-5/month
- **Total: ~$2-5/month**

## Testing Checklist

After R2 setup:

- [ ] Render deployment successful
- [ ] Backend logs show "✅ Using Cloudflare R2 storage"
- [ ] Upload photo from mobile app
- [ ] Photo appears in R2 bucket dashboard
- [ ] Photo displays in mobile app gallery
- [ ] Thumbnail loads correctly
- [ ] Full-size photo opens in viewer
- [ ] Delete photo (when implemented)

## Troubleshooting

**❌ "Failed to upload to R2"**
→ Check R2 credentials in Render environment variables
→ Verify bucket name is correct
→ Check API token has "Object Read & Write" permissions

**❌ Photos upload but don't display**
→ Verify R2_PUBLIC_URL is set correctly
→ Check bucket has public access enabled
→ Confirm CORS policy is configured

**❌ Backend still using local storage**
→ Check all R2 env vars are set in Render
→ Look for "⚠️ Using local filesystem storage" in logs
→ Redeploy after adding env vars

## Development vs Production

### Local Development (Default)
```bash
# No R2 env vars needed
# Just run:
cd apps/api
uvicorn app.main:app --reload
```

### Production (Render + R2)
```bash
# Set env vars in Render dashboard
# Push to GitHub → auto-deploys
git push origin main
```

## Need Help?

1. Read **CLOUDFLARE_R2_SETUP.md** for detailed instructions
2. Check Render logs for error messages
3. Verify all env vars are set correctly
4. Test with a single photo first

Happy uploading! 📸🕷️
