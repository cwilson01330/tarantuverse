# View Care Sheet Button - Troubleshooting Guide

## ✅ FIXED - Species Linking Now Works!

**Update (2025-10-06)**: Species autocomplete has been added to both the Add and Edit pages, and both now properly save the `species_id` when a species is selected!

## Current Implementation

The "View Care Sheet" button **IS** implemented in the tarantula detail page! 

**Location**: `apps/web/src/app/dashboard/tarantulas/[id]/page.tsx` (lines 464-469)

```tsx
{tarantula.species_id && (
  <button
    onClick={() => router.push(`/species/${tarantula.species_id}`)}
    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm inline-flex items-center gap-2"
  >
    📖 View Care Sheet
  </button>
)}
```

## Why You Might Not See It

The button only appears when the tarantula has a `species_id` linked. This is intentional because:
- Not all tarantulas in your collection may have species information
- The button should only show when there's actually a care sheet to view

## How to Make the Button Appear

### ✅ Link Species When Adding a Tarantula (NOW WORKS!)
When adding a new tarantula, use the species autocomplete feature:
1. Go to "Add Tarantula" page
2. Use the "Species Search" field at the top
3. Start typing a species name
4. Select a species from the dropdown
5. This will automatically:
   - Link the `species_id` ✅
   - Populate `scientific_name` and `common_name`
   - Add the species image URL if available
6. Fill in other details and save
7. The "View Care Sheet" button will now appear!

### ✅ Edit Existing Tarantula to Add Species (NOW WORKS!)
1. Go to a tarantula's detail page
2. Click "Edit Info"
3. Use the "Species Search" field at the top (NEW!)
4. Select a species from the autocomplete
5. Save changes
6. The "View Care Sheet" button should now appear!

### Option 3: Check Your Database
If you have tarantulas but the button isn't showing, they might not have `species_id` set.

You can check this by:

**SQL Query** (in your database):
```sql
SELECT id, common_name, scientific_name, species_id 
FROM tarantulas 
WHERE user_id = '<your-user-id>';
```

If `species_id` is `NULL`, that's why the button doesn't appear.

## Available Species in Database

Currently seeded species (check with species autocomplete):
- Grammostola rosea (Chilean Rose Hair)
- Brachypelma hamorii (Mexican Red Knee)
- Aphonopelma chalcodes (Desert Blonde)
- Caribena versicolor (Antilles Pinktoe)
- Tliltocatl albopilosus (Curly Hair)

## Testing the Feature

1. **Create a test tarantula with a species**:
   - Go to Dashboard → Add Tarantula
   - Search for "Chilean Rose" in the species field
   - Select "Grammostola rosea"
   - Fill in a name like "Test Spider"
   - Save

2. **Verify the button appears**:
   - Go to the tarantula's detail page
   - You should see "📖 View Care Sheet" button below the scientific name

3. **Test the button**:
   - Click the button
   - Should navigate to `/species/<species-id>`
   - Should show the full care sheet for Grammostola rosea

## Visual Location

The button appears in the header section of the detail page:

```
┌─────────────────────────────────────┐
│  [Name of Tarantula]      [Photo]   │
│  Scientific name                     │
│  📖 View Care Sheet  ← HERE         │
└─────────────────────────────────────┘
```

## Design Note

The button intentionally:
- Uses a blue color (different from primary brown)
- Has a book emoji (📖) for visual clarity
- Is styled as a prominent call-to-action
- Links directly to the species care sheet page

## Future Enhancement Ideas

If you want the button to always be visible, you could:
1. Show a disabled state with tooltip when no species linked
2. Open a modal to link a species when clicked
3. Add a "Link Species" button when `species_id` is null

But the current implementation is cleaner - it only shows when there's something to view!

---

**TL;DR**: The button exists! Just make sure your tarantulas have a `species_id` by using the species autocomplete when adding/editing them.
