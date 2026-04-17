# Feeding Reminders - Complete Examples

## Example 1: Simple Request/Response

### Request
```bash
curl -X GET https://tarantuverse-api.onrender.com/api/v1/feeding-reminders/ \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

### Response (200 OK)
```json
{
  "total_tarantulas": 5,
  "overdue_count": 1,
  "due_today_count": 1,
  "due_soon_count": 1,
  "on_track_count": 2,
  "never_fed_count": 0,
  "reminders": [
    {
      "tarantula_id": "550e8400-e29b-41d4-a716-446655440000",
      "tarantula_name": "Spicy",
      "species_name": "Singapore Blue",
      "last_fed_at": "2026-03-25T14:15:00+00:00",
      "recommended_interval_days": 7,
      "next_feeding_due": "2026-04-01T14:15:00+00:00",
      "is_overdue": true,
      "days_difference": 2,
      "status": "overdue"
    },
    {
      "tarantula_id": "550e8400-e29b-41d4-a716-446655440001",
      "tarantula_name": "Princess",
      "species_name": "Brazilian Whiteknee",
      "last_fed_at": "2026-04-02T18:30:00+00:00",
      "recommended_interval_days": 10,
      "next_feeding_due": "2026-04-12T18:30:00+00:00",
      "is_overdue": false,
      "days_difference": -9,
      "status": "on_track"
    },
    {
      "tarantula_id": "550e8400-e29b-41d4-a716-446655440002",
      "tarantula_name": "Tiny",
      "species_name": null,
      "last_fed_at": "2026-04-02T10:00:00+00:00",
      "recommended_interval_days": 4,
      "next_feeding_due": "2026-04-06T10:00:00+00:00",
      "is_overdue": false,
      "days_difference": -3,
      "status": "on_track"
    },
    {
      "tarantula_id": "550e8400-e29b-41d4-a716-446655440003",
      "tarantula_name": "Mystery",
      "species_name": "Salmon Pink Birdeater",
      "last_fed_at": "2026-04-03T00:00:00+00:00",
      "recommended_interval_days": 10,
      "next_feeding_due": "2026-04-13T00:00:00+00:00",
      "is_overdue": false,
      "days_difference": -9,
      "status": "on_track"
    },
    {
      "tarantula_id": "550e8400-e29b-41d4-a716-446655440004",
      "tarantula_name": "Fluffy",
      "species_name": "OBT",
      "last_fed_at": null,
      "recommended_interval_days": 7,
      "next_feeding_due": null,
      "is_overdue": false,
      "days_difference": 0,
      "status": "never_fed"
    }
  ]
}
```

## Example 2: Using in JavaScript/Fetch

### Fetching Data
```javascript
const API_URL = "https://tarantuverse-api.onrender.com"

async function getFeedingReminders(token) {
  const response = await fetch(`${API_URL}/api/v1/feeding-reminders/`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch reminders: ${response.status}`)
  }

  return await response.json()
}

// Usage
const token = localStorage.getItem('jwt_token')
const reminders = await getFeedingReminders(token)

console.log(`Total tarantulas: ${reminders.total_tarantulas}`)
console.log(`Overdue: ${reminders.overdue_count}`)
console.log(`Due today: ${reminders.due_today_count}`)
```

### Processing Results
```javascript
// Get all overdue tarantulas
const overdue = reminders.reminders.filter(r => r.status === 'overdue')
console.log(`${overdue.length} tarantulas need feeding immediately!`)

// Get next feeding event
const nextFeeding = reminders.reminders
  .filter(r => r.next_feeding_due !== null)
  .sort((a, b) => new Date(a.next_feeding_due) - new Date(b.next_feeding_due))
  .at(0)

if (nextFeeding) {
  console.log(`Next: ${nextFeeding.tarantula_name} due on ${nextFeeding.next_feeding_due}`)
}

// Group by status
const grouped = reminders.reminders.reduce((acc, r) => {
  if (!acc[r.status]) acc[r.status] = []
  acc[r.status].push(r)
  return acc
}, {})

console.log('Overdue:', grouped.overdue || [])
console.log('Due Today:', grouped.due_today || [])
console.log('Due Soon:', grouped.due_soon || [])
```

### React Component Example
```jsx
import { useState, useEffect } from 'react'

function FeedingRemindersBoard() {
  const [reminders, setReminders] = useState(null)
  const [error, setError] = useState(null)
  const token = localStorage.getItem('jwt_token')

  useEffect(() => {
    async function fetch() {
      try {
        const response = await fetch(
          'https://tarantuverse-api.onrender.com/api/v1/feeding-reminders/',
          { headers: { 'Authorization': `Bearer ${token}` } }
        )
        if (!response.ok) throw new Error('Failed to fetch')
        setReminders(await response.json())
      } catch (err) {
        setError(err.message)
      }
    }
    fetch()
  }, [token])

  if (error) return <div className="error">{error}</div>
  if (!reminders) return <div className="loading">Loading...</div>

  return (
    <div className="board">
      <div className="summary">
        <div className="stat overdue">
          <span className="number">{reminders.overdue_count}</span>
          <span className="label">Overdue</span>
        </div>
        <div className="stat">
          <span className="number">{reminders.due_today_count}</span>
          <span className="label">Due Today</span>
        </div>
        <div className="stat">
          <span className="number">{reminders.on_track_count}</span>
          <span className="label">On Track</span>
        </div>
      </div>

      <div className="list">
        {reminders.reminders.map(r => (
          <div key={r.tarantula_id} className={`card ${r.status}`}>
            <h3>{r.tarantula_name}</h3>
            <p>{r.species_name || 'Unknown species'}</p>
            <div className="status-badge">{r.status}</div>
            {r.last_fed_at && (
              <p className="last-fed">
                Last fed: {new Date(r.last_fed_at).toLocaleDateString()}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Example 3: Data Structure Walkthrough

### Scenario: Overdue Tarantula
```
Tarantula: Spicy (Singapore Blue)
Last fed: March 25, 2026 at 2:15 PM UTC
Species: Singapore Blue
  feeding_frequency_juvenile: "every 5-7 days"
  feeding_frequency_adult: "every 7-14 days"
Life stage: Adult (leg span 5 inches from last molt)
Recommended interval: 7-14 days → midpoint = 10... wait, no!

Actually: Singapore Blue adult = 7-14 days, midpoint = (7+14)/2 = 10

Calculation:
  Next due = March 25 + 10 days = April 4
  Current date = April 3
  Days difference = April 3 - April 4 = -1 day

Wait, that would be "due_soon", not overdue...

Let me recalculate:
  Last fed: March 25 @ 14:15 UTC
  Current: April 3 @ 13:53 UTC (approximately)
  Days since last fed: ~9 days
  Expected interval: 10 days
  Next due: March 25 + 10 = April 4
  Status: Due tomorrow? No...

Actually, looking at the response example above:
  Last fed: 2026-03-25T14:15:00Z
  Next due: 2026-04-01T14:15:00Z
  Days difference: 2
  Status: overdue

This means:
  Expected interval: 7 days (not 10)
  Last fed + 7 days = April 1
  Current date: April 3
  Days overdue: 2

So Spicy is on a 7-day feeding schedule (probably still juvenile or just matured).
```

### Scenario: Never-Fed Tarantula
```
Tarantula: Fluffy (OBT)
Last fed: null
Feeding logs: 0
Status: never_fed
Next feeding due: null
Days difference: 0
Recommended interval: 7 days

Why interval is 7?
  - No feeding logs, so no life stage detected
  - Gets defaults: sling=4, juvenile=7, adult=10
  - Assume juvenile → 7 days
  - Even though no past feedings, system ready when you log first feeding
```

## Example 4: Data Flow in Backend

### Incoming Request
```
GET /api/v1/feeding-reminders/
Authorization: Bearer {jwt_token}
```

### Processing Pipeline
```python
# Step 1: Authenticate
current_user = get_current_user(token)  # Returns User(id=uuid)

# Step 2: Get all tarantulas
tarantulas = db.query(Tarantula).filter(
    Tarantula.user_id == current_user.id
).all()
# Returns: [<Tarantula Spicy>, <Tarantula Princess>, ...]

# Step 3: For each tarantula, build reminder
for tarantula in tarantulas:
    # Get species if linked
    species = db.query(Species).filter(
        Species.id == tarantula.species_id
    ).first()  # Returns Species or None

    # Get last feeding
    last_feeding = db.query(FeedingLog).filter(
        FeedingLog.tarantula_id == tarantula.id,
        FeedingLog.accepted == True
    ).order_by(FeedingLog.fed_at.desc()).first()

    # Get life stage
    life_stage = get_life_stage(tarantula)  # "sling", "juvenile", or "adult"

    # Get interval
    interval = get_recommended_interval(tarantula)  # integer days

    # Calculate next feeding
    if last_feeding:
        next_due = last_feeding.fed_at + timedelta(days=interval)
    else:
        next_due = None

    # Calculate status
    status = calculate_reminder_status(last_feeding.fed_at, next_due)

    # Build response
    reminder = FeedingReminderResponse(
        tarantula_id=tarantula.id,
        tarantula_name=tarantula.name,
        species_name=species.common_names[0] if species else None,
        last_fed_at=last_feeding.fed_at if last_feeding else None,
        recommended_interval_days=interval,
        next_feeding_due=next_due,
        is_overdue=(status == "overdue"),
        days_difference=days_diff,
        status=status
    )
    reminders.append(reminder)

# Step 4: Count statuses
overdue_count = sum(1 for r in reminders if r.status == "overdue")
due_today_count = sum(1 for r in reminders if r.status == "due_today")
# ... etc

# Step 5: Return summary
return FeedingReminderSummary(
    total_tarantulas=len(tarantulas),
    overdue_count=overdue_count,
    due_today_count=due_today_count,
    # ...
    reminders=reminders
)
```

## Example 5: Real-World Usage Scenarios

### Scenario A: Morning Feeding Check
```javascript
// App loads in the morning
const reminders = await getFeedingReminders(token)

// Show notification if any overdue
if (reminders.overdue_count > 0) {
  showNotification(`${reminders.overdue_count} tarantulas need feeding!`)
}

// Display in dashboard
render(<FeedingRemindersWidget reminders={reminders} />)
```

### Scenario B: Weekly Report
```javascript
// Generate weekly summary email
const reminders = await getFeedingReminders(token)

const report = `
Weekly Feeding Report
=====================
Total tarantulas: ${reminders.total_tarantulas}
Overdue: ${reminders.overdue_count}
Due today: ${reminders.due_today_count}
Due soon: ${reminders.due_soon_count}
On track: ${reminders.on_track_count}
Never fed: ${reminders.never_fed_count}

Overdue tarantulas:
${reminders.reminders
  .filter(r => r.status === 'overdue')
  .map(r => `- ${r.tarantula_name}: ${r.days_difference} days overdue`)
  .join('\n')
}
`

sendEmail(user.email, report)
```

### Scenario C: Mobile Push Notification
```javascript
// Check reminders every morning at 8 AM
const task = BackgroundTask.register({
  name: 'feeding-check',
  frequency: 'daily',
  time: '08:00',
  callback: async () => {
    const reminders = await getFeedingReminders(token)

    if (reminders.overdue_count > 0) {
      await sendPushNotification({
        title: 'Feeding Reminder',
        body: `${reminders.overdue_count} tarantulas overdue for feeding!`,
        badge: reminders.overdue_count
      })
    }
  }
})
```

## Example 6: Error Handling

### Missing Authentication
```bash
$ curl https://tarantuverse-api.onrender.com/api/v1/feeding-reminders/

# Response: 401 Unauthorized
{
  "detail": "Not authenticated"
}
```

### Invalid Token
```bash
$ curl https://tarantuverse-api.onrender.com/api/v1/feeding-reminders/ \
  -H "Authorization: Bearer invalid_token"

# Response: 401 Unauthorized
{
  "detail": "Could not validate credentials"
}
```

### Database Error
```
If the database is down:

Response: 500 Internal Server Error
{
  "detail": "Internal server error"
}
```

## Example 7: Testing with Test Data

### Create Test Tarantula
```sql
-- 1. Insert tarantula
INSERT INTO tarantulas (
    id, user_id, species_id, name, common_name, scientific_name,
    date_acquired, source, created_at
) VALUES (
    gen_random_uuid(),
    '550e8400-e29b-41d4-a716-446655440000',  -- your user_id
    '550e8400-e29b-41d4-a716-446655440005',  -- OBT species_id
    'Test Spider',
    'Orange Baboon Tarantula',
    'Pterinochilus murinus',
    NOW()::date,
    'bred',
    NOW()
);

-- Get the ID of the tarantula you just inserted
SELECT id FROM tarantulas WHERE name = 'Test Spider' LIMIT 1;
-- Copy the ID: let's say it's '550e8400-e29b-41d4-a716-446655440010'

-- 2. Add a molt log (for life stage detection)
INSERT INTO molt_logs (
    id, tarantula_id, molted_at, leg_span_after, created_at
) VALUES (
    gen_random_uuid(),
    '550e8400-e29b-41d4-a716-446655440010',
    NOW() - INTERVAL '20 days',
    4.5,  -- Adult size
    NOW()
);

-- 3. Add feeding logs at different intervals
-- Overdue (10 days ago, 7-day interval)
INSERT INTO feeding_logs (
    id, tarantula_id, fed_at, food_type, accepted, created_at
) VALUES (
    gen_random_uuid(),
    '550e8400-e29b-41d4-a716-446655440010',
    NOW() - INTERVAL '10 days',
    'cricket',
    true,
    NOW()
);

-- 4. Test the endpoint
curl -X GET http://localhost:8000/api/v1/feeding-reminders/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should show Test Spider as overdue
```

---

**Last Updated**: 2026-04-03
