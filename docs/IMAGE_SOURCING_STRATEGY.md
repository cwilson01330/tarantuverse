# Species Image Sourcing Strategy

## Overview

This document outlines the strategy for sourcing high-quality, properly licensed images for the Tarantuverse species database. All images must be freely usable with proper attribution.

## Image Sources (Priority Order)

### 1. Wikimedia Commons (PRIMARY)
**Why**: Free, high-quality, properly licensed, well-documented

**API Documentation**: https://www.mediawiki.org/wiki/API:Main_page

**Search Strategy**:
```typescript
// Example: Search for tarantula images
const searchWikimedia = async (scientificName: string) => {
  const baseUrl = 'https://commons.wikimedia.org/w/api.php';
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `${scientificName} haswbstatement:P31=Q16521`, // Q16521 = taxon
    gsrlimit: '10',
    prop: 'imageinfo|categories',
    iiprop: 'url|user|extmetadata',
    iiurlwidth: '800',
    origin: '*' // CORS
  });

  const response = await fetch(`${baseUrl}?${params}`);
  const data = await response.json();
  return data;
};
```

**License Filtering**:
Only use images with these licenses:
- CC0 (Public Domain)
- CC BY (Attribution)
- CC BY-SA (Attribution-ShareAlike)
- NOT: CC BY-NC (No Commercial), CC BY-ND (No Derivatives)

**Example Response Format**:
```json
{
  "imageinfo": [{
    "url": "https://upload.wikimedia.org/...",
    "descriptionurl": "https://commons.wikimedia.org/wiki/File:...",
    "user": "PhotographerName",
    "extmetadata": {
      "LicenseShortName": {"value": "CC BY-SA 4.0"},
      "Attribution": {"value": "John Smith"},
      "LicenseUrl": {"value": "https://creativecommons.org/licenses/by-sa/4.0/"}
    }
  }]
}
```

### 2. iNaturalist (SECONDARY)
**Why**: Community-contributed, research-grade observations with photos

**API Documentation**: https://api.inaturalist.org/v1/docs/

**Search Strategy**:
```typescript
const searchINaturalist = async (scientificName: string) => {
  const baseUrl = 'https://api.inaturalist.org/v1/observations';
  const params = new URLSearchParams({
    taxon_name: scientificName,
    photos: 'true',
    quality_grade: 'research', // Only verified observations
    per_page: '10',
    order: 'desc',
    order_by: 'votes' // Most favorited first
  });

  const response = await fetch(`${baseUrl}?${params}`);
  const data = await response.json();
  return data;
};
```

**License Requirements**:
Check `photo.license_code` field:
- ✅ `cc0`
- ✅ `cc-by`
- ✅ `cc-by-sa`
- ❌ `cc-by-nc`, `cc-by-nd`, `cc-by-nc-sa`, `cc-by-nc-nd`

**Example Response Format**:
```json
{
  "results": [{
    "taxon": {
      "name": "Grammostola rosea",
      "preferred_common_name": "Chilean Rose Hair"
    },
    "photos": [{
      "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/.../original.jpg",
      "attribution": "(c) User Name, some rights reserved (CC BY)",
      "license_code": "cc-by"
    }]
  }]
}
```

### 3. User Uploads (TERTIARY)
**When**: Users can upload photos of their own tarantulas

**Requirements**:
- User must own copyright or have permission
- Uploaded to Cloudflare R2 (already implemented)
- Optional: Allow users to submit images for species database (moderation required)

## Implementation Plan

### Phase 1: Manual Curated Images (RECOMMENDED FOR NOW)
**Best approach for early stage**:

1. Create `/public/species-images/` directory
2. Manually download CC-licensed images from Wikimedia/iNaturalist
3. Rename with pattern: `{genus}_{species}.jpg`
4. Store credits in JSON file:

```json
// /public/species-images/credits.json
{
  "grammostola_rosea": {
    "filename": "grammostola_rosea.jpg",
    "credit": "John Smith",
    "source": "Wikimedia Commons",
    "license": "CC BY-SA 4.0",
    "url": "https://commons.wikimedia.org/wiki/File:..."
  }
}
```

5. Update frontend to use local images:
```typescript
const getSpeciesImage = (genus: string, species: string) => {
  const filename = `${genus.toLowerCase()}_${species.toLowerCase()}.jpg`;
  return `/species-images/${filename}`;
};
```

**Advantages**:
- ✅ 100% control over image quality
- ✅ No API rate limits
- ✅ Fast loading (local images)
- ✅ Properly vetted licenses
- ✅ No broken links

**Disadvantages**:
- ❌ Manual work to build library
- ❌ Need to track ~100-500 images
- ❌ Updates require manual download

### Phase 2: Automated API Integration (FUTURE)
**When you have 500+ species**:

1. Create background job to fetch images
2. Cache in Cloudflare R2 with metadata
3. Fallback chain: Local cache → Wikimedia API → iNaturalist API → Placeholder
4. Admin review queue for new images

## Recommended Workflow

### For Initial Database (0-100 species):
```bash
# 1. Create directory
mkdir -p apps/web/public/species-images

# 2. For each species:
# - Search Wikimedia Commons manually
# - Verify license (CC0, CC BY, CC BY-SA only)
# - Download high-res image
# - Resize to 1200px wide (maintain aspect ratio)
# - Save as: genus_species.jpg

# 3. Update credits.json
# 4. Update species model to use local images
```

### For Growing Database (100-500 species):
```bash
# 1. Create helper script:
# scripts/download-species-image.ts

import { searchWikimedia, searchINaturalist } from './utils';

const downloadImage = async (scientificName: string) => {
  // Try Wikimedia first
  const wikiResults = await searchWikimedia(scientificName);
  if (wikiResults.suitable) {
    return downloadFromWiki(wikiResults);
  }

  // Fallback to iNaturalist
  const iNatResults = await searchINaturalist(scientificName);
  if (iNatResults.suitable) {
    return downloadFromINat(iNatResults);
  }

  console.warn(`No suitable image found for ${scientificName}`);
};
```

### For Large Database (500+ species):
Implement automated system with:
- Daily cron job to fetch missing images
- Image quality scoring (resolution, focus, composition)
- Admin approval queue
- Automatic resizing and optimization

## Image Quality Standards

### Minimum Requirements:
- **Resolution**: 800x600 pixels minimum
- **Format**: JPEG or PNG
- **Focus**: Sharp, clear view of spider
- **Composition**:
  - Full body visible
  - Neutral or natural background
  - Good lighting
  - No watermarks (unless photographer credit)

### Preferred:
- **Resolution**: 1200x900 pixels or higher
- **Subject**: Adult specimen (not sling)
- **Angle**: Dorsal (top-down) view
- **Background**: Neutral or blurred natural habitat

## Attribution Display

### On Species Card:
```tsx
<div className="text-xs text-gray-500 mt-2">
  Photo: {credits.photographer} •
  <a href={credits.sourceUrl} className="underline">Source</a> •
  {credits.license}
</div>
```

### On Species Detail Page:
```tsx
<div className="bg-black/60 text-white text-sm px-4 py-2 absolute bottom-0 left-0 right-0">
  <div className="flex items-center justify-between">
    <div>
      Photo by <strong>{credits.photographer}</strong>
    </div>
    <div className="flex items-center gap-2">
      <span>{credits.license}</span>
      <a href={credits.sourceUrl} className="underline">View Original</a>
    </div>
  </div>
</div>
```

## Legal Compliance

### CC BY (Attribution)
**Requirements**:
- Credit photographer
- Link to license
- Link to original work

**Example**:
> Photo by John Smith (CC BY 4.0), [view original](https://commons.wikimedia.org/wiki/File:...)

### CC BY-SA (Attribution-ShareAlike)
**Requirements**:
- Credit photographer
- Link to license
- Link to original work
- Any derivatives must use same license

### CC0 (Public Domain)
**Requirements**:
- No attribution required (but nice to include)

## Database Schema Updates

Add to `species` model:
```typescript
interface Species {
  // ... existing fields

  // Primary image
  image_url: string | null;
  image_credit: {
    photographer: string;
    source: 'wikimedia' | 'inaturalist' | 'user' | 'manual';
    license: string; // 'CC0', 'CC BY 4.0', etc.
    source_url: string;
    uploaded_at: string;
  } | null;

  // Gallery
  image_gallery: Array<{
    url: string;
    credit: {
      photographer: string;
      source: string;
      license: string;
      source_url: string;
    };
    description?: string;
  }>;
}
```

## Maintenance

### Quarterly Review:
- Check for broken image links
- Update outdated licenses
- Replace low-quality images with better ones
- Add missing species images

### When Adding New Species:
1. Search Wikimedia Commons first
2. If not found, search iNaturalist
3. Verify license compatibility
4. Download and optimize image
5. Add credit information
6. Update species record

## Tools & Resources

### Image Search:
- https://commons.wikimedia.org/
- https://www.inaturalist.org/
- https://search.creativecommons.org/

### License Info:
- https://creativecommons.org/licenses/
- https://wiki.creativecommons.org/wiki/Best_practices_for_attribution

### Image Optimization:
```bash
# Resize to 1200px width, maintain aspect ratio
convert input.jpg -resize 1200x output.jpg

# Or use sharp in Node.js:
import sharp from 'sharp';
await sharp('input.jpg')
  .resize({ width: 1200 })
  .jpeg({ quality: 85 })
  .toFile('output.jpg');
```

## Next Steps

### Immediate (Week 1):
1. ✅ Create `/public/species-images/` directory
2. ✅ Download images for top 20 most common species
3. ✅ Create `credits.json` file
4. Update frontend to use local images
5. Test on staging environment

### Short-term (Month 1):
1. Complete images for all seeded species (5 currently)
2. Document image sourcing workflow
3. Create helper scripts for batch downloads
4. Set up image optimization pipeline

### Long-term (Quarter 1):
1. Build automated image fetching system
2. Implement admin approval queue
3. Add user-submitted image feature
4. Create image quality scoring algorithm

---

**Last Updated**: 2025-10-28
**Maintained By**: Development Team
