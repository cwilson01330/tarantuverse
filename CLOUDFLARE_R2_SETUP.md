# Cloudflare R2 Setup Guide

## Step 1: Create Cloudflare R2 Account

1. **Sign up for Cloudflare** (if you don't have an account):
   - Go to https://dash.cloudflare.com/sign-up
   - Create a free account

2. **Navigate to R2**:
   - From Cloudflare dashboard, click **R2** in the left sidebar
   - Click **"Purchase R2"** (don't worry - there's a generous free tier)
   - Confirm to enable R2 on your account

## Step 2: Create R2 Bucket

1. **Create a new bucket**:
   - Click **"Create bucket"**
   - Bucket name: `tarantuverse-photos`
   - Location: Choose **Automatic** (or closest to your users)
   - Click **"Create bucket"**

2. **Configure public access**:
   - Click on your `tarantuverse-photos` bucket
   - Go to **Settings** tab
   - Under **Public Access**, click **"Allow Access"**
   - This allows public read access to your images

3. **Set up custom domain (Optional but recommended)**:
   - Go to **Settings** > **Custom Domains**
   - Click **"Connect Domain"**
   - Enter: `photos.yourdomain.com` (or use a subdomain)
   - Follow DNS setup instructions
   - OR use the default R2.dev URL: `pub-[hash].r2.dev`

## Step 3: Get API Credentials

1. **Create API Token**:
   - Go to **R2** > **Overview**
   - Click **"Manage R2 API Tokens"** (top right)
   - Click **"Create API Token"**
   
2. **Configure token permissions**:
   - Token name: `tarantuverse-backend`
   - Permissions: **Object Read & Write**
   - TTL: **Forever** (or set expiration if preferred)
   - Click **"Create API Token"**

3. **Save these credentials** (you won't see them again!):
   ```
   Account ID: [your-account-id]
   Access Key ID: [your-access-key-id]
   Secret Access Key: [your-secret-access-key]
   ```

4. **Get your R2 endpoint**:
   - Format: `https://[account-id].r2.cloudflarestorage.com`
   - Example: `https://abc123def456.r2.cloudflarestorage.com`

## Step 4: Configure CORS (for mobile app uploads)

1. **Set CORS policy**:
   - In your bucket, go to **Settings** > **CORS policy**
   - Click **"Edit CORS policy"**
   - Add this JSON:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Step 5: Add Environment Variables to Render

1. **Go to your Render dashboard**:
   - Navigate to your `tarantuverse-api` service
   - Click **"Environment"** in the left sidebar

2. **Add these environment variables**:
   ```
   R2_ACCOUNT_ID=your-account-id-here
   R2_ACCESS_KEY_ID=your-access-key-id-here
   R2_SECRET_ACCESS_KEY=your-secret-access-key-here
   R2_BUCKET_NAME=tarantuverse-photos
   R2_PUBLIC_URL=https://pub-[hash].r2.dev
   ```

3. **Click "Save Changes"** - Render will redeploy automatically

## Step 6: Update Local Development

1. **Create `.env` file** in `apps/api/`:
   ```bash
   # Cloudflare R2 Configuration
   R2_ACCOUNT_ID=your-account-id-here
   R2_ACCESS_KEY_ID=your-access-key-id-here
   R2_SECRET_ACCESS_KEY=your-secret-access-key-here
   R2_BUCKET_NAME=tarantuverse-photos
   R2_PUBLIC_URL=https://pub-[hash].r2.dev
   ```

2. **Add `.env` to `.gitignore`** (if not already):
   ```
   .env
   .env.local
   ```

## Step 7: Testing

Once deployed, test the integration:

1. **Upload a photo** from your mobile app
2. **Check R2 bucket** - you should see the file in Cloudflare dashboard
3. **View the photo** in your mobile app gallery
4. **Delete a photo** - verify it's removed from R2

## Cost Estimates

With Cloudflare R2:
- **Storage**: $0.015/GB/month
- **Egress**: FREE! 🎉
- **Operations**: $0.36 per million Class A operations (write), $0.036 per million Class B operations (read)

**Example costs for 1,000 photos (2GB total):**
- Storage: $0.03/month
- Bandwidth: $0 (free egress!)
- Operations: ~$0.01/month
- **Total: ~$0.04/month** 🚀

## Troubleshooting

### Images not appearing:
- Check R2_PUBLIC_URL is set correctly
- Verify bucket has public access enabled
- Check CORS policy is configured

### Upload failing:
- Verify API credentials are correct
- Check Render environment variables
- Look at backend logs for errors

### Permission errors:
- Ensure API token has "Object Read & Write" permissions
- Verify bucket name matches R2_BUCKET_NAME

## Next Steps

After R2 is working:
1. ✅ Set up image optimization (resize on upload)
2. ✅ Add image compression
3. ✅ Consider adding CDN caching headers
4. ✅ Monitor R2 usage in Cloudflare dashboard
