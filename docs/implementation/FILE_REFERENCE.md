# Advanced Analytics Dashboard - File Reference

## Quick Navigation

### Absolute File Paths

#### Backend Files
```
/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/api/app/routers/analytics.py
/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/api/app/schemas/analytics.py
/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/api/app/main.py (already includes router)
```

#### Web Frontend Files
```
/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/web/src/app/dashboard/analytics/advanced/page.tsx
/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/web/src/app/dashboard/analytics/page.tsx
```

#### Mobile Frontend Files
```
/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/mobile/app/analytics/advanced.tsx
/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/mobile/app/analytics/index.tsx
```

#### Documentation Files
```
/sessions/gifted-jolly-davinci/mnt/tarantuverse/ADVANCED_ANALYTICS_IMPLEMENTATION.md
/sessions/gifted-jolly-davinci/mnt/tarantuverse/ADVANCED_ANALYTICS_QUICK_START.md
/sessions/gifted-jolly-davinci/mnt/tarantuverse/IMPLEMENTATION_CHECKLIST.md
/sessions/gifted-jolly-davinci/mnt/tarantuverse/FILE_REFERENCE.md (this file)
```

## File Summary Table

| File | Type | Lines | Purpose |
|------|------|-------|---------|
| analytics.py | Backend API | 466 | Advanced analytics endpoint |
| analytics.py (schema) | Backend Schema | Updated | Response models |
| advanced/page.tsx | Web Frontend | 568 | Advanced analytics dashboard page |
| page.tsx (analytics) | Web Frontend | Updated | Navigation button added |
| advanced.tsx | Mobile Frontend | 625 | Advanced analytics screen |
| index.tsx (analytics) | Mobile Frontend | Updated | Navigation button added |
| IMPLEMENTATION.md | Documentation | 12KB | Technical details |
| QUICK_START.md | Documentation | 6.6KB | Developer guide |
| CHECKLIST.md | Documentation | Full | Verification checklist |

## Relative Paths (from repo root)

### Backend
- `apps/api/app/routers/analytics.py`
- `apps/api/app/schemas/analytics.py`

### Web
- `apps/web/src/app/dashboard/analytics/advanced/page.tsx` (NEW)
- `apps/web/src/app/dashboard/analytics/page.tsx`

### Mobile
- `apps/mobile/app/analytics/advanced.tsx` (NEW)
- `apps/mobile/app/analytics/index.tsx`

### Documentation
- `ADVANCED_ANALYTICS_IMPLEMENTATION.md`
- `ADVANCED_ANALYTICS_QUICK_START.md`
- `IMPLEMENTATION_CHECKLIST.md`
- `FILE_REFERENCE.md`

## What Changed Where

### Backend Changes
```diff
apps/api/app/routers/analytics.py
- Line 1-20: Updated imports (added extract)
- Line 262-466: Added get_advanced_analytics() endpoint

apps/api/app/schemas/analytics.py
- Line 50-80: Added new schema classes
  • MoltHeatmapEntry
  • CollectionGrowthEntry
  • SpeciesDistEntry
  • AdvancedAnalyticsResponse
```

### Web Changes
```diff
apps/web/src/app/dashboard/analytics/page.tsx
- Line 188-197: Added navigation section with button

apps/web/src/app/dashboard/analytics/advanced/page.tsx
- ENTIRE FILE: New (568 lines)
```

### Mobile Changes
```diff
apps/mobile/app/analytics/index.tsx
- Line 396-410: Added sparkle button to header

apps/mobile/app/analytics/advanced.tsx
- ENTIRE FILE: New (625 lines)
```

## API Endpoint

### New Endpoint
```
GET /api/v1/analytics/advanced/
```

### Route Registration
Location: `apps/api/app/main.py` (line 172)
```python
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])
```

Status: Already registered, no changes needed

## Dependencies

### Backend Dependencies
- FastAPI (existing)
- SQLAlchemy with extract() (existing)
- Pydantic (existing)

No new dependencies added.

### Web Dependencies
- Next.js (existing)
- React (existing)
- Recharts (existing - already in package.json)
- Tailwind CSS (existing)

No new dependencies added.

### Mobile Dependencies
- React Native (existing)
- Expo Router (existing)
- Expo Vector Icons (existing)

No new dependencies added.

## Database

### Tables Used
- `tarantula` - Collection value, species, sex, enclosure_type, date_acquired
- `molt_log` - Molt heatmap, molt counts
- `feeding_log` - Feeding cost estimation

### No Migrations Needed
All required fields already exist in the schema.

## Configuration

### Environment Variables Needed
None - uses existing API_URL and database configuration.

### API Client Configuration
Location: `apps/mobile/src/services/api.ts`

Already configured to use correct API endpoint.

## Build & Deployment

### Build Commands
```bash
# Backend (no build needed)
# Just run migrations: alembic upgrade head

# Web
npm run build

# Mobile
eas build
```

### Deployment Targets
- Backend: Render (https://tarantuverse-api.onrender.com)
- Web: Vercel
- Mobile: EAS Build / App Stores

## Imports & Dependencies in New Code

### Backend
```python
from sqlalchemy import func, extract
from app.schemas.analytics import (
    AdvancedAnalyticsResponse,
    MoltHeatmapEntry,
    CollectionGrowthEntry,
    SpeciesDistEntry,
)
```

### Web
```typescript
import { BarChart, Bar, LineChart, Line, PieChart, Pie, ... } from 'recharts'
import DashboardLayout from "@/components/DashboardLayout"
import { useAuth } from "@/hooks/useAuth"
```

### Mobile
```typescript
import { useTheme } from '../../src/contexts/ThemeContext'
import { apiClient } from '../../src/services/api'
```

## Testing Files

No test files created (can be added as needed).

Recommended test locations:
- `apps/api/tests/test_analytics.py` - Backend endpoint tests
- `apps/web/__tests__/analytics-advanced.test.tsx` - Web component tests
- `apps/mobile/__tests__/analytics-advanced.test.ts` - Mobile component tests

## Git Tracking

### New Files to Commit
```
apps/web/src/app/dashboard/analytics/advanced/page.tsx
apps/mobile/app/analytics/advanced.tsx
ADVANCED_ANALYTICS_IMPLEMENTATION.md
ADVANCED_ANALYTICS_QUICK_START.md
IMPLEMENTATION_CHECKLIST.md
FILE_REFERENCE.md
```

### Modified Files to Commit
```
apps/api/app/routers/analytics.py
apps/api/app/schemas/analytics.py
apps/web/src/app/dashboard/analytics/page.tsx
apps/mobile/app/analytics/index.tsx
```

### Do NOT Commit
- `.env` files
- `node_modules/`
- `__pycache__/`
- `.DS_Store`

## Verification Checklist

### Files That Should Exist
- [ ] `/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/api/app/routers/analytics.py`
- [ ] `/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/api/app/schemas/analytics.py`
- [ ] `/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/web/src/app/dashboard/analytics/advanced/page.tsx`
- [ ] `/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/mobile/app/analytics/advanced.tsx`
- [ ] `/sessions/gifted-jolly-davinci/mnt/tarantuverse/ADVANCED_ANALYTICS_IMPLEMENTATION.md`
- [ ] `/sessions/gifted-jolly-davinci/mnt/tarantuverse/ADVANCED_ANALYTICS_QUICK_START.md`
- [ ] `/sessions/gifted-jolly-davinci/mnt/tarantuverse/IMPLEMENTATION_CHECKLIST.md`

### Files That Should Be Modified
- [ ] `/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/api/app/routers/analytics.py` (contains new endpoint)
- [ ] `/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/api/app/schemas/analytics.py` (contains new schemas)
- [ ] `/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/web/src/app/dashboard/analytics/page.tsx` (contains link button)
- [ ] `/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/mobile/app/analytics/index.tsx` (contains sparkle button)

## Quick Links for Development

### View Backend Endpoint
`/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/api/app/routers/analytics.py`
Lines 263-466

### View Web Page
`/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/web/src/app/dashboard/analytics/advanced/page.tsx`
Full file

### View Mobile Screen
`/sessions/gifted-jolly-davinci/mnt/tarantuverse/apps/mobile/app/analytics/advanced.tsx`
Full file

### Read Implementation Details
`/sessions/gifted-jolly-davinci/mnt/tarantuverse/ADVANCED_ANALYTICS_IMPLEMENTATION.md`

### Quick Start Guide
`/sessions/gifted-jolly-davinci/mnt/tarantuverse/ADVANCED_ANALYTICS_QUICK_START.md`

### Full Checklist
`/sessions/gifted-jolly-davinci/mnt/tarantuverse/IMPLEMENTATION_CHECKLIST.md`

---

**Last Updated**: 2026-04-03
**Status**: Complete and Ready for Testing
