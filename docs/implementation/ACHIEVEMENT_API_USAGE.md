# Achievement System - API Usage Guide

## Endpoints

All endpoints are prefixed with `/api/v1`

### 1. List User's Achievements
```
GET /achievements/
Headers: Authorization: Bearer {token}
```

**Returns**: AchievementSummary with all achievements (earned + unearned)

**Response**:
```json
{
  "total_available": 18,
  "total_earned": 5,
  "achievements": [
    {
      "id": "uuid",
      "key": "first_tarantula",
      "name": "First Steps",
      "description": "Added your first tarantula to your collection",
      "icon": "🕷️",
      "category": "collection",
      "tier": "bronze",
      "requirement_count": 1,
      "earned_at": "2026-04-03T10:30:00+00:00"
    },
    {
      "id": "uuid",
      "key": "collector_5",
      "name": "Collector",
      "description": "Added 5 tarantulas to your collection",
      "icon": "🏺",
      "category": "collection",
      "tier": "bronze",
      "requirement_count": 5,
      "earned_at": null
    }
  ],
  "recently_earned": [
    { ... last 5 earned achievements ... }
  ]
}
```

### 2. Check Achievements & Get Newly Earned
```
POST /achievements/check
Headers: Authorization: Bearer {token}
Query Params:
  - category: Optional (collection|feeding|molts|community|breeding)
```

**Returns**: List of newly awarded achievements

**Response**:
```json
[
  {
    "id": "uuid",
    "key": "first_feeding",
    "name": "First Meal",
    "description": "Logged your first feeding",
    "icon": "🦗",
    "category": "feeding",
    "tier": "bronze",
    "earned_at": "2026-04-03T15:45:00+00:00"
  }
]
```

**Example with category filter**:
```
POST /achievements/check?category=collection
```

### 3. View User's Public Achievements
```
GET /users/{username}/achievements
```

**Returns**: Only earned achievements (earned_at != null)

**Response**:
```json
{
  "total_available": 18,
  "total_earned": 3,
  "achievements": [
    {
      "id": "uuid",
      "key": "first_tarantula",
      "name": "First Steps",
      "icon": "🕷️",
      "category": "collection",
      "tier": "bronze",
      "requirement_count": 1,
      "earned_at": "2026-04-03T10:30:00+00:00"
    },
    {
      "id": "uuid",
      "key": "first_feeding",
      "name": "First Meal",
      "icon": "🦗",
      "category": "feeding",
      "tier": "bronze",
      "requirement_count": 1,
      "earned_at": "2026-04-03T15:45:00+00:00"
    },
    {
      "id": "uuid",
      "key": "first_molt",
      "name": "First Shed",
      "icon": "🐚",
      "category": "molts",
      "tier": "bronze",
      "requirement_count": 1,
      "earned_at": "2026-04-03T16:20:00+00:00"
    }
  ],
  "recently_earned": [ ... ]
}
```

## Integration with Existing Endpoints

To enable automatic achievement awarding, add these calls to relevant endpoints:

### After Creating a Tarantula
```python
from app.services.achievement_service import check_and_award

# In tarantulas router, after POST /tarantulas/
newly_awarded = check_and_award(db, current_user.id, category="collection")
# Return newly_awarded in response or trigger notification
```

### After Logging a Feeding
```python
# In feedings router, after POST /tarantulas/{id}/feedings
newly_awarded = check_and_award(db, current_user.id, category="feeding")
```

### After Logging a Molt
```python
# In molts router, after POST /tarantulas/{id}/molts
newly_awarded = check_and_award(db, current_user.id, category="molts")
```

### After Creating a Forum Post
```python
# In forums router, after POST /forums/threads
newly_awarded = check_and_award(db, current_user.id, category="community")
```

### After Creating a Pairing
```python
# In pairings router, after POST /pairings/
newly_awarded = check_and_award(db, current_user.id, category="breeding")
```

### After Following a User
```python
# In follows router, after POST /follows/{user_id}
newly_awarded = check_and_award(db, current_user.id, category="community")
```

## Using cURL for Testing

### List all achievements
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://tarantuverse-api.onrender.com/api/v1/achievements/
```

### Check for newly earned (all categories)
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  https://tarantuverse-api.onrender.com/api/v1/achievements/check
```

### Check for newly earned (collection only)
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  https://tarantuverse-api.onrender.com/api/v1/achievements/check?category=collection
```

### View public achievements
```bash
curl https://tarantuverse-api.onrender.com/api/v1/users/johndoe/achievements
```

## Achievement List Reference

| Key | Name | Icon | Category | Tier | Requirement |
|-----|------|------|----------|------|-------------|
| first_tarantula | First Steps | 🕷️ | collection | bronze | 1 tarantula |
| collector_5 | Collector | 🏺 | collection | bronze | 5 tarantulas |
| collector_10 | Serious Collector | 🏺 | collection | silver | 10 tarantulas |
| collector_25 | Prolific Collector | 🎪 | collection | gold | 25 tarantulas |
| collector_50 | The Arachnid Tycoon | 👑 | collection | platinum | 50 tarantulas |
| first_feeding | First Meal | 🦗 | feeding | bronze | 1 feeding |
| dedicated_feeder_50 | Dedicated Feeder | 🦗 | feeding | silver | 50 feedings |
| dedicated_feeder_100 | Master Feeder | 🍽️ | feeding | gold | 100 feedings |
| feeding_streak_7 | Week-Long Commitment | 🔥 | feeding | silver | 7 consecutive days |
| feeding_streak_30 | Feeding Consistency | 🔥 | feeding | gold | 30 consecutive days |
| first_molt | First Shed | 🐚 | molts | bronze | 1 molt |
| molt_watcher_10 | Molt Watcher | 🐚 | molts | silver | 10 molts |
| molt_watcher_25 | Growth Analyst | 📊 | molts | gold | 25 molts |
| first_post | Voice Your Thoughts | 💬 | community | bronze | 1 forum post |
| contributor_10 | Active Contributor | 📢 | community | silver | 10 forum posts |
| social_butterfly | Social Butterfly | 🦋 | community | silver | 10 following |
| first_pairing | Love Connection | 💕 | breeding | silver | 1 pairing |
| breeder | Successful Breeder | 🏆 | breeding | gold | 1 successful pairing |

## Database Schema

### achievement_definitions
```sql
CREATE TABLE achievement_definitions (
  id UUID PRIMARY KEY,
  key VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(300) NOT NULL,
  icon VARCHAR(10) NOT NULL,
  category VARCHAR(50) NOT NULL INDEX,
  tier VARCHAR(20) NOT NULL,
  requirement_count INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIMEZONE
);
```

### user_achievements
```sql
CREATE TABLE user_achievements (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievement_definitions(id) ON DELETE CASCADE,
  earned_at TIMESTAMP WITH TIMEZONE,
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_achievement ON user_achievements(achievement_id);
```

## Performance Notes

- All queries use batch aggregations (no N+1)
- Feeding streak calculation is O(n) where n = user's feeding logs
- `check_and_award()` is safe to call repeatedly (unique constraint prevents duplicates)
- Results are cached in response objects, no additional queries needed

## Frontend Integration

### Profile Component
```typescript
// Display earned achievements on user profile
const achievements = await fetch(`/api/v1/users/${username}/achievements`)
  .then(r => r.json());

return (
  <div className="achievements">
    {achievements.achievements.map(badge => (
      <div key={badge.id} title={badge.description}>
        {badge.icon}
      </div>
    ))}
  </div>
);
```

### Achievement Notifications
```typescript
// After action (create tarantula, log feeding, etc.)
const response = await fetch('/api/v1/achievements/check', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
const newlyEarned = await response.json();

if (newlyEarned.length > 0) {
  // Show toast notification
  showNotification(`🎉 Earned: ${newlyEarned[0].name}`);
}
```

### Achievement Progress
```typescript
// Show progress toward next achievement
const achievements = await fetch('/api/v1/achievements/').then(r => r.json());

const collectionAchievements = achievements.achievements
  .filter(a => a.category === 'collection');

// Show progress bar for next unearned
const nextUnearned = collectionAchievements.find(a => !a.earned_at);
// User has X/Y tarantulas for next achievement
```
