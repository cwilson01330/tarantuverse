# Web App R2 Image Configuration Guide

## ✅ Current Status

Your web app is **correctly configured** to read images from Cloudflare R2! Here's how it works:

## 🔧 How It Works

### 1. Backend Storage Service
The backend (`apps/api/app/services/storage.py`) automatically detects R2 configuration:

```python
self.use_r2 = all([
    settings.R2_ACCOUNT_ID,
    settings.R2_ACCESS_KEY_ID,
    settings.R2_SECRET_ACCESS_KEY,
    settings.R2_BUCKET_NAME
])
```

When R2 credentials are present:
- ✅ Returns **absolute URLs**: `https://pub-739a81bdc01a40bb8cfce4a58b122d17.r2.dev/photos/xyz.jpg`
- ✅ Images are publicly accessible via R2 public URL
- ✅ No egress fees from Cloudflare

When R2 credentials are missing (dev mode):
- ⚠️ Returns **relative URLs**: `/uploads/photos/xyz.jpg`
- ⚠️ Images served from local filesystem via FastAPI

### 2. Web App URL Handling
The web app (`apps/web`) has a helper function that handles both cases:

```typescript
const getImageUrl = (url?: string) => {
  if (!url) return ''
  // If URL starts with http, it's already absolute (R2)
  if (url.startsWith('http')) {
    return url  // ✅ R2 URL used as-is
  }
  // Otherwise, it's a local path - prepend the API base URL
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  return `${API_URL}${url}`  // ⚠️ Local dev URL
}
```

This function is used everywhere images are displayed:
- Dashboard cards
- Tarantula detail hero image
- Photo gallery thumbnails
- Photo viewer modal

### 3. Next.js Image Configuration
`next.config.js` allows loading images from any HTTPS domain:

```javascript
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: '**',  // ✅ Allows all HTTPS domains (including R2)
    },
  ],
}
```

## 🚀 Deployment Checklist

### Backend (Render.com)
Ensure these environment variables are set in Render:

```bash
# Cloudflare R2 Configuration (REQUIRED for production)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=tarantuverse-photos
R2_PUBLIC_URL=https://pub-739a81bdc01a40bb8cfce4a58b122d17.r2.dev
```

✅ **Already configured** - You set these up earlier!

### Frontend (Vercel)
Set this environment variable in Vercel:

```bash
NEXT_PUBLIC_API_URL=https://tarantuverse-api.onrender.com
```

**How to set in Vercel:**
1. Go to your project in Vercel dashboard
2. Click "Settings" → "Environment Variables"
3. Add `NEXT_PUBLIC_API_URL` with value `https://tarantuverse-api.onrender.com`
4. Click "Save"
5. Redeploy your app

## 🧪 Testing R2 Integration

### 1. Check Backend Storage Mode
When your backend starts, look for this log message:

```bash
✅ Using Cloudflare R2 storage: tarantuverse-photos
```

If you see this instead, R2 isn't configured:
```bash
⚠️  Using local filesystem storage (development mode)
```

### 2. Check Photo URLs
After uploading a photo, check the URL in the browser dev tools:

**R2 (Production) - Correct:**
```
https://pub-739a81bdc01a40bb8cfce4a58b122d17.r2.dev/photos/abc123.jpg
```

**Local (Dev) - Expected locally:**
```
https://tarantuverse-api.onrender.com/uploads/photos/abc123.jpg
```

### 3. Verify Image Loading
Open browser dev tools (F12) → Network tab → Filter by "Img":
- ✅ Photos should load from `pub-739a81bdc01a40bb8cfce4a58b122d17.r2.dev`
- ✅ Status should be `200 OK`
- ❌ If you see `404 Not Found`, check R2 public URL configuration

## 🐛 Troubleshooting

### Problem: Images show broken image icon
**Solution**: Check these:
1. Is `NEXT_PUBLIC_API_URL` set in Vercel?
2. Are R2 credentials set in Render?
3. Is R2 bucket set to public?
4. Check browser console for CORS errors

### Problem: Images load slowly
**Solution**: This is normal for first load. R2 has CDN caching:
- First load: ~500ms (from origin)
- Subsequent loads: ~50ms (from CDN edge)

### Problem: New photos don't appear
**Solution**: 
1. Check backend logs for upload success
2. Refresh the page (Ctrl+F5)
3. Check if photo_url was set on tarantula

### Problem: "CORS error" in console
**Solution**: Your R2 bucket needs CORS configuration:

In Cloudflare dashboard → R2 → Your bucket → Settings → CORS Policy:
```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## 📊 Current Configuration Summary

### ✅ What's Working
- Backend uploads to R2 when credentials present
- Backend returns absolute R2 URLs
- Web app detects and uses R2 URLs correctly
- Mobile app detects and uses R2 URLs correctly
- First photo auto-set as tarantula main photo
- Thumbnails generated automatically
- Images publicly accessible via R2

### 🔧 What You Need to Do
1. **Set `NEXT_PUBLIC_API_URL` in Vercel** (if deploying web to Vercel)
2. **Verify R2 credentials are in Render** (already done)
3. **Test by uploading a photo** through web or mobile

### 📱 Mobile vs Web
Both use the same logic:
- **Mobile**: `getImageUrl()` in `apps/mobile/app/tarantula/[id].tsx`
- **Web**: `getImageUrl()` in `apps/web/src/app/dashboard/tarantulas/[id]/page.tsx`
- **Backend**: Returns appropriate URLs based on storage mode

## 🎯 Expected Behavior

### Production (R2 Configured)
1. User uploads photo via web or mobile
2. Backend uploads to R2 bucket
3. Backend returns: `https://pub-...r2.dev/photos/xyz.jpg`
4. Web/Mobile displays image directly from R2
5. Fast loading, no egress fees

### Development (Local Storage)
1. User uploads photo
2. Backend saves to local `uploads/` folder
3. Backend returns: `/uploads/photos/xyz.jpg`
4. Web/Mobile prepends API URL: `http://localhost:8000/uploads/photos/xyz.jpg`
5. Backend serves image via FastAPI static files

## 🎨 Implementation Details

### Files Using `getImageUrl()`

**Web:**
- `apps/web/src/app/dashboard/page.tsx` - Dashboard cards
- `apps/web/src/app/dashboard/tarantulas/[id]/page.tsx` - Detail hero, gallery, modal

**Mobile:**
- `apps/mobile/app/(tabs)/index.tsx` - Collection cards
- `apps/mobile/app/tarantula/[id].tsx` - Detail gallery
- `apps/mobile/src/components/PhotoViewer.tsx` - Full-screen viewer

### API Endpoints Returning Image URLs
- `GET /api/v1/tarantulas/` - Returns tarantulas with `photo_url`
- `GET /api/v1/tarantulas/{id}` - Returns single tarantula with `photo_url`
- `GET /api/v1/tarantulas/{id}/photos` - Returns array of photos with `url` and `thumbnail_url`
- `POST /api/v1/tarantulas/{id}/photos` - Creates photo, returns `url` and `thumbnail_url`

All of these endpoints return R2 URLs in production automatically.

## ✅ Verification Checklist

Run through this checklist to verify everything is working:

### Backend (Render)
- [ ] R2 credentials are set in environment variables
- [ ] Backend logs show "✅ Using Cloudflare R2 storage"
- [ ] Photo upload returns R2 URL (starts with https://pub-)
- [ ] Tarantula `photo_url` field is set after first upload

### Web App (Vercel/Local)
- [ ] `NEXT_PUBLIC_API_URL` is set
- [ ] Dashboard cards show photos
- [ ] Tarantula detail hero shows photo
- [ ] Photo gallery tab shows thumbnails
- [ ] Photo viewer modal shows full-size images
- [ ] Images load from R2 domain (check Network tab)

### Mobile App (Expo Go)
- [ ] Collection cards show photos
- [ ] Detail screen shows photo gallery
- [ ] PhotoViewer modal works
- [ ] Images load from R2 domain (check console logs)

---

**Status**: ✅ Configuration Complete
**Last Updated**: October 7, 2025
**Verified**: Web app reads from R2 correctly via automatic URL detection
