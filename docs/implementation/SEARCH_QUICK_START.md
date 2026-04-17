# Global Search Quick Start Guide

## Quick Setup (5 minutes)

### 1. Backend is Ready
No additional setup needed. The search router is already registered in `main.py`.

Test it immediately:
```bash
# API should be running on port 8000
curl "http://localhost:8000/api/v1/search?q=tarantula"
```

### 2. Web Frontend Integration
Search is already integrated in the TopBar component. Just start the web server:
```bash
cd apps/web
npm run dev
# Visit http://localhost:3000/dashboard
# Click search icon or press Cmd+K
```

### 3. Mobile Frontend Integration
Search tab is already added to navigation. Just start the mobile app:
```bash
cd apps/mobile
npm start
# Open in Expo Go
# Tap the Search tab
```

## Usage

### Web
1. Click the search icon in the top bar
2. Type your query (minimum 2 characters)
3. Use arrow keys to navigate, Enter to select
4. Press Escape to close

### Mobile
1. Tap the Search tab in the bottom navigation
2. Type your query in the search input
3. Tap a result to view details

### API (Direct)

```bash
# Search all types
curl "http://localhost:8000/api/v1/search?q=rose"

# Search specific type
curl "http://localhost:8000/api/v1/search?q=rose&type=species"

# With authentication
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8000/api/v1/search?q=myspider"
```

## How It Works

### Search Types
- **Tarantulas**: User's own collection (requires login)
- **Species**: Public species database (always visible)
- **Keepers**: Active user profiles (always visible)
- **Forums**: Public forum threads (always visible)

### Result Limits
- 5 results per type
- 20 total maximum
- Results grouped by type

### Performance
- Debounced: 300ms wait after typing
- Case-insensitive ILIKE searches
- Uses database indexes for speed

## File Structure

```
Backend:
  apps/api/app/schemas/search.py ............. Response schemas
  apps/api/app/routers/search.py ............ Single GET /search endpoint
  apps/api/app/main.py ...................... Router registration

Web:
  apps/web/src/components/GlobalSearch.tsx .. Modal search component
  apps/web/src/components/TopBar.tsx ........ Button integration

Mobile:
  apps/mobile/app/search.tsx ................ Full screen search
  apps/mobile/app/(tabs)/_layout.tsx ........ Tab navigation
```

## Test Queries

Try these to test the search:

**Tarantulas** (requires login):
- Search your own tarantula names
- Example: "Rose" if you have a tarantula named Rose

**Species**:
- `"Acanthoscurria"` - Genus name
- `"geniculata"` - Species name
- `"Brazilian"` - Common name

**Keepers**:
- Any active username or display name on the platform

**Forums**:
- Any forum thread title words

## Common Issues & Fixes

| Problem | Solution |
|---------|----------|
| Search button not showing | Make sure TopBar component is rendered |
| Results not appearing | Type at least 2 characters, wait 300ms |
| Dark mode text hard to read | Check dark mode classes are applied |
| Mobile tab not showing | Verify tabs._layout.tsx was updated |
| 404 on result click | Check route names match (/dashboard/tarantulas, /species, etc.) |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+K (Mac) / Ctrl+K (Windows) | Open/close search |
| ↑ ↓ | Navigate results |
| Enter | Select result |
| Esc | Close search |

## Environment Variables

No new environment variables needed. Uses existing:
- `NEXT_PUBLIC_API_URL` (web)
- `EXPO_PUBLIC_API_URL` (mobile)

## Next Steps

1. Test the search in development
2. Verify all result URLs navigate correctly
3. Test keyboard shortcuts and dark mode
4. Deploy with confidence!

## Performance Notes

Search is optimized for:
- Fast response times (uses database indexes)
- Minimal API overhead (limited to 5 results per type)
- Smooth UX (debounced input, instant visual feedback)

**No additional backend setup required.**
