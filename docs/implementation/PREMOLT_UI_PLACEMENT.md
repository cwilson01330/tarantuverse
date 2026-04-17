# Premolt Prediction UI Placement Guide

## Web Application

### Dashboard Page (`/dashboard`)
```
┌─────────────────────────────────────────────────────────────┐
│                     Top Navigation Bar                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  📢 Announcement Banner                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [NEW] Premolt Alerts Card                           │    │
│  │ ┌─────────────────────────────────────────────┐     │    │
│  │ │ 🕷️ Premolt Alerts                          │     │    │
│  │ │ 2 tarantulas may be in premolt              │     │    │
│  │ │                                              │     │    │
│  │ │ • Species A  [HIGH] confidence              │     │    │
│  │ │ • Species B  [MEDIUM] confidence            │     │    │
│  │ └─────────────────────────────────────────────┘     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  📊 Quick Stats Row (4 cards)                                │
│  ├─ My Collection                                            │
│  ├─ Needs Feeding                                            │
│  ├─ Recent Molts                                             │
│  └─ Premolt Alerts                                           │
│                                                               │
│  Two-Column Layout:                                          │
│  ┌───────────────────────────────┬──────────────────────┐   │
│  │  Left (2/3 width)             │  Right (1/3 width)   │   │
│  │  • Feeding Alerts             │  • Quick Actions     │   │
│  │  • Communal Setups            │  • Recent Activity   │   │
│  │  • Premolt Watch List         │                      │   │
│  └───────────────────────────────┴──────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Tarantula Detail Page (`/dashboard/tarantulas/[id]`)
```
┌─────────────────────────────────────────────────────────────┐
│                  Tarantula Name & Photo                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Two-Column Layout:                                          │
│  ┌───────────────────────────────┬──────────────────────┐   │
│  │  Left (2/3 width)             │  Right (1/3 width)   │   │
│  │  ┌─────────────────────────┐  │  ┌────────────────┐  │   │
│  │  │ Basic Information       │  │  │ Pricing Card   │  │   │
│  │  └─────────────────────────┘  │  └────────────────┘  │   │
│  │  ┌─────────────────────────┐  │  ┌────────────────┐  │   │
│  │  │ [NEW] Premolt Section   │  │  │ Feeding Stats  │  │   │
│  │  │ ┌───────────────────┐   │  │  │ Card           │  │   │
│  │  │ │ 🔮 Prediction     │   │  │  └────────────────┘  │   │
│  │  │ │ Status & Metrics  │   │  │  ┌────────────────┐  │   │
│  │  │ │ • Refusals: 3     │   │  │  │ Statistics     │  │   │
│  │  │ │ • Days: 45        │   │  │  │ Card           │  │   │
│  │  │ │ • Progress: 60%   │   │  │  └────────────────┘  │   │
│  │  │ └───────────────────┘   │  │                      │   │
│  │  └─────────────────────────┘  │                      │   │
│  │  ┌─────────────────────────┐  │                      │   │
│  │  │ Recent Activity         │  │                      │   │
│  │  └─────────────────────────┘  │                      │   │
│  │  ┌─────────────────────────┐  │                      │   │
│  │  │ Notes                   │  │                      │   │
│  │  └─────────────────────────┘  │                      │   │
│  │  ┌─────────────────────────┐  │                      │   │
│  │  │ Feeding History         │  │                      │   │
│  │  └─────────────────────────┘  │                      │   │
│  │  ┌─────────────────────────┐  │                      │   │
│  │  │ Molt History            │  │                      │   │
│  │  └─────────────────────────┘  │                      │   │
│  │  ┌─────────────────────────┐  │                      │   │
│  │  │ Substrate Changes       │  │                      │   │
│  │  └─────────────────────────┘  │                      │   │
│  │  ┌─────────────────────────┐  │                      │   │
│  │  │ Photos                  │  │                      │   │
│  │  └─────────────────────────┘  │                      │   │
│  │  ┌─────────────────────────┐  │                      │   │
│  │  │ Growth Analytics        │  │                      │   │
│  │  └─────────────────────────┘  │                      │   │
│  │  ┌─────────────────────────┐  │                      │   │
│  │  │ Breeding Info           │  │                      │   │
│  │  └─────────────────────────┘  │                      │   │
│  └───────────────────────────────┴──────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Mobile Application

### Collection Screen (`/(tabs)/collection`)
```
┌──────────────────────────────┐
│   Collection (Tab 1 of 5)    │
├──────────────────────────────┤
│ ┌────────────────────────────┐
│ │ [NEW] Premolt Alert Card   │
│ │ ┌──────────────────────┐   │
│ │ │ 🕷️ Premolt Alerts    │   │
│ │ │ 2 in premolt         │   │
│ │ │ [Tap to expand ↓]    │   │
│ │ │                      │   │
│ │ │ • Species A [HIGH]   │   │
│ │ │ • Species B [MEDIUM] │   │
│ │ └──────────────────────┘   │
│ └────────────────────────────┘
│ ┌────────────────────────────┐
│ │ 🔍 Search by name...       │
│ └────────────────────────────┘
│ ┌────────────────────────────┐
│ │ Sort: [A-Z] [Last Fed]... │
│ └────────────────────────────┘
│ ┌────────────────────────────┐
│ │ 🕷️ My Collection  [Grid][List]
│ └────────────────────────────┘
│ ┌────────────────────────────┐
│ │ 📊 Collection Stats        │
│ │ • Total: 5                 │
│ │ • Species: 4               │
│ │ • Feedings: 23             │
│ │ • Molts: 3                 │
│ └────────────────────────────┘
│
│ 🕷️ [Photo] Species Name
│    Scientific Name
│    [✓ 3d] [🦋 65%]
│
│ 🕷️ [Photo] Species Name
│    Scientific Name
│    [⏰ 7d]
│
│ [+ Add Tarantula FAB button]
│
└──────────────────────────────┘
```

### Tarantula Detail Screen (`/tarantula/[id]`)
```
┌──────────────────────────────┐
│   Species Name               │
│   Scientific Name            │
├──────────────────────────────┤
│                              │
│ [PHOTO or PLACEHOLDER]       │
│ [Back] [Menu: Edit/Delete]   │
│                              │
│ ┌────────────────────────────┐
│ │ Basic Information           │
│ │ • Sex: Female               │
│ │ • Age: 2 years              │
│ │ • Acquired: 2024-01-15      │
│ └────────────────────────────┘
│ ┌────────────────────────────┐
│ │ [NEW] Premolt Prediction   │
│ │ ┌──────────────────────┐   │
│ │ │ 🔮 Prediction [HIGH] │   │
│ │ │                      │   │
│ │ │ 🦋 Likely in premolt │   │
│ │ │                      │   │
│ │ │ Feeding refusals: 3  │   │
│ │ │ Days since molt: 45  │   │
│ │ │ Progress: ████░░ 60% │   │
│ │ │ (Avg: 75 days)       │   │
│ │ │ Refusal rate: 40%    │   │
│ │ │ Window: ~10 days     │   │
│ │ └──────────────────────┘   │
│ └────────────────────────────┘
│ ┌────────────────────────────┐
│ │ Husbandry                  │
│ │ • Enclosure: 10x10x10"     │
│ │ • Substrate: Coco fiber    │
│ │ • Last fed: 2024-04-01     │
│ │ • Last molt: 2025-02-15    │
│ └────────────────────────────┘
│ ┌────────────────────────────┐
│ │ Feeding History            │
│ │ • Cricket (Large)  ✓       │
│ │ • Roach (Medium)   ✓       │
│ │ • Mealworm (Medium) ✗      │
│ └────────────────────────────┘
│ ┌────────────────────────────┐
│ │ Molt History               │
│ │ • 2025-02-15: 2.3" → 2.5"  │
│ │ • 2024-12-03: 2.1" → 2.3"  │
│ └────────────────────────────┘
│ ┌────────────────────────────┐
│ │ Substrate Changes          │
│ │ • 2025-03-01: Routine      │
│ └────────────────────────────┘
│ ┌────────────────────────────┐
│ │ Photos                     │
│ │ [Photo Carousel]           │
│ └────────────────────────────┘
│
│ [📊 Analytics] [🥚 Breeding]
│ [📖 Care Sheet] [🗑️ Delete]
│
└──────────────────────────────┘
```

---

## Color Scheme by Confidence Level

### Confidence: HIGH (Red)
- **Web**: `bg-red-50 dark:bg-red-900/20` | `border-red-200 dark:border-red-800`
- **Mobile**: `#fee2e2` | `#fecaca`
- **Badge**: `bg-red-500`

### Confidence: MEDIUM (Amber)
- **Web**: `bg-amber-50 dark:bg-amber-900/20` | `border-amber-200 dark:border-amber-800`
- **Mobile**: `#fef3c7` | `#fcd34d`
- **Badge**: `bg-amber-500` / `#f59e0b`

### Confidence: LOW (Gray)
- **Web**: `bg-gray-50 dark:bg-gray-900/20` | `border-gray-200 dark:border-gray-700`
- **Mobile**: `#f3f4f6` | `#e5e7eb`
- **Badge**: `bg-gray-400` / `#9ca3af`

### No Alerts (Green)
- **Web**: `bg-green-50 dark:bg-green-900/20` | `border-green-200 dark:border-green-800`
- **Mobile**: `#dcfce7` | `#bbf7d0`
- **Badge**: `bg-green-500`

### Insufficient Data (Blue)
- **Web**: `bg-blue-50 dark:bg-blue-900/20` | `border-blue-200 dark:border-blue-800`
- **Mobile**: Uses theme primary color with opacity

---

## Component Props

### Web Components

#### PremoltAlertsCard
- **Props**: None
- **Auth**: Uses `useAuth()` hook
- **Router**: Uses `useRouter()` for navigation

#### PremoltPredictionSection
- **Props**:
  - `tarantulaId: string` (required)
- **Auth**: Uses `useAuth()` hook
- **Router**: Uses built-in route context

### Mobile Components

#### PremoltAlertCard
- **Props**: None
- **Auth**: Uses apiClient (authenticated by default)
- **Router**: Uses `useRouter()` for navigation

#### PremoltPredictionCard
- **Props**:
  - `tarantulaId: string` (required)
- **Auth**: Uses apiClient (authenticated by default)
- **Router**: Not used directly

---

## States & Transitions

### PremoltAlertsCard States
1. **Loading** → Skeleton animation
2. **No Data** → null (hidden)
3. **Insufficient Data** → Blue info card
4. **All Clear** → Green success card
5. **Has Alerts** → Amber alert card with list

### PremoltPredictionSection States
1. **Loading** → Skeleton animation
2. **No Data** → null (hidden)
3. **Insufficient Data** → Blue message
4. **Good/Fair Data** → Full prediction card

### PremoltAlertCard States (Mobile)
1. **Loading** → ActivityIndicator in card
2. **No Data** → null (hidden)
3. **All Clear** → Green card
4. **Has Alerts** → Amber card, collapsible list

### PremoltPredictionCard States (Mobile)
1. **Loading** → ActivityIndicator
2. **No Data** → null (hidden)
3. **Insufficient Data** → Info message
4. **Good/Fair Data** → Full metrics card
