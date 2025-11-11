# Species Entry Workflow - Testing Guide

## Setup Complete ✅

### Backend Changes
- ✅ Added `is_verified` field to `SpeciesCreate` schema (defaults to `False`)
- ✅ Updated species creation endpoint to respect `is_verified` for admins
- ✅ Regular users always get `is_verified=False`, admins can set to `True`
- ✅ All species fields properly mapped

### Frontend Changes
- ✅ Created admin form at `/dashboard/admin/species/add`
- ✅ Added "Add Species" button on species page (admin-only)
- ✅ Updated authentication flow to pass `is_superuser` field
- ✅ Updated TypeScript types for NextAuth

---

## Manual Testing Steps

### 1. Verify Admin Access
1. Log in as an admin user (with `is_superuser=True` in database)
2. Navigate to `/species` page
3. **Expected**: You should see "➕ Add Species" button in top-right
4. **If not admin**: Button should not appear

### 2. Access Admin Form
1. Click "Add Species" button
2. **Expected**: Navigate to `/dashboard/admin/species/add`
3. **Expected**: See comprehensive form with all fields organized in sections

### 3. Test Form Submission
Fill out the form with test data:

**Basic Information:**
- Scientific Name: `Grammostola pulchra`
- Common Names: `Brazilian Black, Brazilian Black Tarantula`
- Genus: `Grammostola`
- Family: `Theraphosidae`
- Care Level: `beginner`
- Type: `terrestrial`
- Temperament: `docile, calm`
- Native Region: `Brazil`

**Size & Growth:**
- Adult Size: `7-8 inches`
- Growth Rate: `slow`

**Temperature & Humidity:**
- Min Temperature: `70`
- Max Temperature: `80`
- Min Humidity: `65`
- Max Humidity: `75`

**Enclosure:**
- Sling: `Small vial or 2x2x3"`
- Juvenile: `5x5x5"`
- Adult: `10x10x10" or 5-10 gallon`
- Substrate Type: `coco fiber, peat moss`
- Substrate Depth: `4-5 inches`

**Feeding:**
- Prey Size: `Appropriately sized (1/2 to 2/3 body length)`
- Sling: `Every 2-3 days`
- Juvenile: `2-3 times per week`
- Adult: `Once per week`

**Behavior:**
- Water Dish Required: `✓ checked`
- Webbing Amount: `moderate`
- Burrowing: `✓ checked`

**Care Guide:**
```
The Brazilian Black is one of the most docile tarantula species available in the hobby. It's known for its jet-black coloration and calm demeanor, making it an excellent choice for beginners.

This terrestrial species is a slow grower but very hardy. It rarely kicks hairs and almost never displays defensive behavior. The Brazilian Black is an opportunistic burrower and will often modify its enclosure with webbing.

Keep substrate moist but not wet, with good ventilation. This species is very forgiving of minor husbandry mistakes, making it perfect for first-time keepers.
```

**Additional Info:**
- Image URL: (leave blank or use Wikimedia Commons URL)
- Source URL: (optional)
- Mark as Verified: `✓ checked`

### 4. Submit and Verify
1. Click "✅ Add Species" button
2. **Expected**: Success alert appears: "✅ Successfully added Grammostola pulchra!"
3. **Expected**: Form clears and scrolls to top
4. **Expected**: Can immediately add another species

### 5. Verify Species Appears
1. Navigate back to `/species` page
2. Search for "Brazilian Black" or "Grammostola pulchra"
3. **Expected**: New species appears in results
4. **Expected**: Green verified checkmark visible
5. Click on species card
6. **Expected**: All entered data displays correctly

---

## Common Issues & Troubleshooting

### Issue: "Add Species" button not visible
- **Cause**: User is not marked as admin
- **Fix**: Check database - ensure user has `is_superuser=True`
- **Fix**: Log out and log back in to refresh session

### Issue: Form submission fails
- **Check**: Browser console for error messages
- **Check**: Network tab for API response
- **Check**: Backend logs for validation errors

### Issue: 400 Bad Request
- **Cause**: Species already exists (duplicate scientific name)
- **Fix**: Check if species is already in database
- **Fix**: Use different species name

### Issue: 401 Unauthorized
- **Cause**: Not logged in or token expired
- **Fix**: Log out and log back in

---

## Database Verification

To check if species was created successfully:

```sql
-- Check the species table
SELECT
  scientific_name,
  common_names,
  care_level,
  is_verified,
  submitted_by
FROM species
WHERE scientific_name_lower = 'grammostola pulchra';
```

---

## Ready for Bulk Entry

Once testing is successful, you can proceed with adding 30-40 species using:
1. The admin form (10-15 min per species)
2. Reference `SPECIES_TODO.md` for priority list
3. Use ethical data sources listed in TODO file

**Time Estimate**: 5-8 hours for 30 species

---

## Notes

- Form auto-clears after successful submission for rapid entry
- Can keep form open and add multiple species in sequence
- Use copy-paste for common phrases (substrate types, prey sizes, etc.)
- Wikimedia Commons has many Creative Commons licensed tarantula images
- Always verify taxonomy with World Spider Catalog before entry
