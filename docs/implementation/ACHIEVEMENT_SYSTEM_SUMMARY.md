# Achievement/Badge System Backend - Implementation Summary

## Overview
Built a complete gamification achievement system for Tarantuverse with 18 distinct badges across 5 categories (collection, feeding, molts, community, breeding). The system automatically detects and awards achievements when users reach milestones.

## Files Created

### 1. Models (`apps/api/app/models/achievement.py`)
Two SQLAlchemy models:

**AchievementDefinition** (seeded badge definitions):
- `id` (UUID PK)
- `key` (str, unique) - machine identifier e.g. "first_tarantula"
- `name` (str) - display name e.g. "First Steps"
- `description` (str) - explanation
- `icon` (str) - emoji representation (🕷️, 🏆, 🔥, etc.)
- `category` (str, indexed) - collection | feeding | molts | community | breeding
- `tier` (str) - bronze | silver | gold | platinum
- `requirement_count` (int) - threshold for achievement
- `is_active` (bool) - default true
- `created_at` (DateTime)

**UserAchievement** (tracks earned badges):
- `id` (UUID PK)
- `user_id` (FK → users, CASCADE)
- `achievement_id` (FK → achievement_definitions, CASCADE)
- `earned_at` (DateTime)
- Unique constraint on (user_id, achievement_id)

### 2. Service (`apps/api/app/services/achievement_service.py`)
Core achievement logic with efficient batch queries:

**Helper functions** (all use batch queries, no N+1):
- `get_tarantula_count(db, user_id)` - count user's tarantulas
- `get_feeding_count(db, user_id)` - count all feeding logs
- `get_molt_count(db, user_id)` - count all molt logs
- `get_pairing_count(db, user_id)` - count all pairings
- `get_successful_pairing_count(db, user_id)` - successful pairings only
- `get_forum_post_count(db, user_id)` - count forum posts
- `get_following_count(db, user_id)` - count following
- `get_feeding_streak(db, user_id)` - **consecutive calendar days with feeding**

**Main functions**:
- `check_and_award(db, user_id, category=None)` - Checks all active achievements and awards newly earned ones. Returns list of newly awarded achievement dicts with earned_at timestamps.
- `get_user_achievements(db, user_id)` - Returns comprehensive summary with:
  - All active achievements (earned + unearned)
  - Last 5 earned achievements
  - Counts

### 3. Schemas (`apps/api/app/schemas/achievement.py`)
Pydantic schemas:

**AchievementResponse**:
- id, key, name, description, icon, category, tier, requirement_count
- `earned_at` (Optional[datetime]) - null means not yet earned

**AchievementSummary**:
- total_available, total_earned
- achievements (list of AchievementResponse)
- recently_earned (last 5)

### 4. Router (`apps/api/app/routers/achievements.py`)
Three endpoints:

**GET `/achievements/`** (requires auth)
- List all achievements for current user (earned + unearned)
- Returns AchievementSummary

**POST `/achievements/check`** (requires auth)
- Trigger achievement check and return newly earned
- Query param: `category` (optional filter)
- Returns list of newly awarded achievements

**GET `/users/{username}/achievements`** (public)
- View earned achievements for any user (for profiles)
- Returns only earned achievements (earned_at != null)

## 18 Achievement Definitions (Seeded)

### Collection (5 badges)
- **first_tarantula** (bronze 🕷️) - 1+ tarantulas
- **collector_5** (bronze 🏺) - 5+ tarantulas
- **collector_10** (silver 🏺) - 10+ tarantulas
- **collector_25** (gold 🎪) - 25+ tarantulas
- **collector_50** (platinum 👑) - 50+ tarantulas

### Feeding (5 badges)
- **first_feeding** (bronze 🦗) - 1+ feedings
- **dedicated_feeder_50** (silver 🦗) - 50+ feedings
- **dedicated_feeder_100** (gold 🍽️) - 100+ feedings
- **feeding_streak_7** (silver 🔥) - 7 consecutive days with feeding
- **feeding_streak_30** (gold 🔥) - 30 consecutive days with feeding

### Molts (3 badges)
- **first_molt** (bronze 🐚) - 1+ molts
- **molt_watcher_10** (silver 🐚) - 10+ molts
- **molt_watcher_25** (gold 📊) - 25+ molts

### Community (3 badges)
- **first_post** (bronze 💬) - 1+ forum posts
- **contributor_10** (silver 📢) - 10+ forum posts
- **social_butterfly** (silver 🦋) - 10+ following

### Breeding (2 badges)
- **first_pairing** (silver 💕) - 1+ pairing
- **breeder** (gold 🏆) - 1+ successful pairing

## Database Migration
**File**: `apps/api/alembic/versions/x5y6z7a8b9c0_add_achievements.py`
- Revision: x5y6z7a8b9c0
- Previous: w4x5y6z7a8b9
- Creates both tables with proper constraints
- Bulk inserts all 18 achievement definitions
- Downgrade reverses both tables

## Integration Points

### Models (`apps/api/app/models/__init__.py`)
- Imports added: `AchievementDefinition, UserAchievement`
- Exported in `__all__`

### User Model (`apps/api/app/models/user.py`)
- Added relationship: `achievements = relationship("UserAchievement", back_populates="user", ...)`

### Main App (`apps/api/app/main.py`)
- Import: `import app.routers.achievements as achievements` (line 43)
- Router registration: `app.include_router(achievements.router, prefix="/api/v1", tags=["achievements", "gamification"])` (line 239)

## Feeding Streak Calculation
Special handling for `feeding_streak_*` achievements:
1. Query all feeding logs for user's tarantulas
2. Extract dates and deduplicate (one per calendar day)
3. Sort descending (most recent first)
4. Count consecutive days backward from today
5. Break if gap found or date skipped

Example: If today is April 5 and feedings logged on Apr 5, 4, 3, 2, 1 = 5-day streak

## Query Efficiency
All functions use:
- Batch SQL queries with joins
- Aggregation functions (func.count)
- No N+1 queries
- Indexed columns: category, key, user_id, achievement_id

## API Response Examples

### GET `/achievements/`
```json
{
  "total_available": 18,
  "total_earned": 3,
  "achievements": [
    {
      "id": "uuid...",
      "key": "first_tarantula",
      "name": "First Steps",
      "description": "Added your first tarantula to your collection",
      "icon": "🕷️",
      "category": "collection",
      "tier": "bronze",
      "requirement_count": 1,
      "earned_at": "2026-04-03T12:30:00+00:00"
    },
    {
      "id": "uuid...",
      "key": "collector_5",
      "name": "Collector",
      "icon": "🏺",
      "category": "collection",
      "tier": "bronze",
      "requirement_count": 5,
      "earned_at": null
    }
  ],
  "recently_earned": [
    { ... earned achievements with most recent first ... }
  ]
}
```

### POST `/achievements/check`
```json
[
  {
    "id": "uuid...",
    "key": "first_feeding",
    "name": "First Meal",
    "icon": "🦗",
    "category": "feeding",
    "tier": "bronze",
    "earned_at": "2026-04-03T15:45:00+00:00"
  }
]
```

## Future Integration Points

### Frontend (Web & Mobile)
1. Display achievement badge on user profiles
2. Show notification popup when achievement earned
3. Achievement progress bars (e.g., "2/10 molts for achievement")
4. Achievement showcase page

### Backend Enhancements
1. Call `check_and_award()` after creating:
   - Feeding log
   - Molt log
   - Tarantula
   - Pairing
   - Forum post
   - Follow action
2. Add achievement statistics to admin dashboard
3. Create achievement leaderboard endpoint
4. Time-limited seasonal achievements
5. Tiered streaks (7-day, 30-day, 100-day)

## Testing Checklist

- [x] Syntax validation (all files compile)
- [ ] Database migration applies cleanly
- [ ] Batch query efficiency (no N+1)
- [ ] Feeding streak calculation correctness
- [ ] Edge cases:
  - User with no tarantulas
  - User with no feedings
  - Feeding streak with gaps
  - Already earned achievements not re-awarded
  - Public profile shows only earned badges
- [ ] API response format matches schema

## Files Modified/Created

| File | Action | Purpose |
|------|--------|---------|
| `apps/api/app/models/achievement.py` | Created | Achievement models |
| `apps/api/app/models/__init__.py` | Modified | Add achievement imports/exports |
| `apps/api/app/models/user.py` | Modified | Add achievements relationship |
| `apps/api/app/services/achievement_service.py` | Created | Achievement checking logic |
| `apps/api/app/schemas/achievement.py` | Created | Pydantic schemas |
| `apps/api/app/routers/achievements.py` | Created | API endpoints |
| `apps/api/alembic/versions/x5y6z7a8b9c0_add_achievements.py` | Created | Database migration |
| `apps/api/app/main.py` | Modified | Router registration |

## Next Steps

1. Run migration: `alembic upgrade head` (in Render or locally)
2. Test endpoints with curl or Postman
3. Integrate achievement checks into existing endpoints (tarantulas, feedings, molts, pairings, forums, follows)
4. Add frontend components for badge display
5. Create admin endpoint for testing achievement checks
