# Mobile UI/UX Improvements

## Issues Found

### Species Detail Screen (`/species/[id]`)
1. ❌ No hero image/gradient visible - needs placeholder when image_url is null
2. ❌ Species name not showing in hero section
3. ❌ Tabs text invisible (dark on dark)
4. ❌ Quick Facts icons and text hard to read
5. ❌ Community rating shows raw "0" - needs better formatting
6. ❌ Overall dark theme contrast too low

### Species List Screen (`/species`)
1. ❌ Filter chip text invisible
2. ✅ Card layout good
3. ✅ Verified badge placement good

## Fixes to Implement

### Detail Screen:
- Add fallback gradient background when no hero image
- Display species name prominently in hero
- Fix tab styling (active/inactive states, better contrast)
- Improve Quick Facts section visibility
- Format community rating properly (show "No ratings yet" if 0)
- Add better spacing and padding
- Fix all text contrast issues

### List Screen:
- Fix filter chip text colors
- Ensure all text is visible in dark mode
- Polish card shadows/borders

## Implementation Order
1. Fix species detail hero section ✅
2. Fix species detail tabs ✅  
3. Fix Quick Facts section ✅
4. Fix community rating display ✅
5. Fix filter chips on list screen ✅
