# 🗺️ Tarantuverse Development Roadmap

**Execution Order:** Analytics → Community → Mobile Polish → Breeding Tools  
**Start Date:** October 7, 2025

---

## 🎯 Phase 2C: Analytics & Insights (NEXT - 2-3 weeks)

### Week 1: Growth Tracking & Visualization
**Goal:** Let users see their tarantula's growth over time

#### Backend Work:
- [x] Weight and leg span fields already in molt logs ✓
- [ ] Add growth analytics endpoint: `GET /api/v1/tarantulas/{id}/growth`
  - Returns time-series data: date, weight, leg_span
  - Calculate growth rate percentages
  - Identify growth spurts

#### Frontend Work - Web:
- [ ] Install chart library (Recharts or Chart.js)
- [ ] Create GrowthChart component
  - Line chart for weight over time
  - Line chart for leg span over time
  - Dual-axis chart option
  - Date range selector (30d, 90d, 1y, all)
- [ ] Add "Growth" tab to tarantula detail page
- [ ] Show latest measurements in overview

#### Frontend Work - Mobile:
- [ ] Install react-native-chart-kit or Victory Native
- [ ] Create mobile GrowthChart component
- [ ] Add "Growth" section to detail screen
- [ ] Swipeable charts for weight/size

**Success Metrics:**
- Beautiful, responsive charts
- Data updates in real-time after logging molt
- Export chart as image feature

---

### Week 2: Feeding Analytics
**Goal:** Analyze feeding patterns and predict next feeding

#### Backend Work:
- [ ] Add feeding analytics endpoint: `GET /api/v1/tarantulas/{id}/feeding-stats`
  - Average days between feedings
  - Total feedings count
  - Acceptance rate (% accepted)
  - Last feeding date
  - Next feeding prediction
  - Feeding streaks
  - Most common prey types

#### Frontend Work - Web:
- [ ] Create FeedingStats component
  - Acceptance rate donut chart
  - Feeding frequency bar chart
  - Prey type distribution
  - Timeline view of feedings
- [ ] Add "Feeding Analytics" section to detail page
- [ ] Show "Last fed X days ago" on collection cards
- [ ] Color-code overdue feedings (>14 days = yellow, >30 = red)

#### Frontend Work - Mobile:
- [ ] Add feeding stats cards to detail screen
- [ ] Show "last fed" indicator on collection cards
- [ ] Visual feeding schedule/calendar
- [ ] Push notification for feeding reminders (optional)

**Success Metrics:**
- Accurate feeding predictions
- Clear visual indicators for when to feed
- Easy to spot neglected tarantulas

---

### Week 3: Collection Dashboard & Statistics
**Goal:** Bird's-eye view of entire collection with insights

#### Backend Work:
- [ ] Add collection analytics endpoint: `GET /api/v1/analytics/collection`
  - Total tarantulas count
  - Species diversity (unique species)
  - Sex distribution
  - Age distribution
  - Total collection value
  - Average feeding frequency
  - Most/least active molters
  - Newest/oldest acquisitions

#### Frontend Work - Web:
- [ ] Create new Analytics page: `/dashboard/analytics`
- [ ] Collection Overview section:
  - Stat cards (total, species, value)
  - Sex distribution pie chart
  - Species distribution bar chart
- [ ] Activity Timeline:
  - Recent feedings across collection
  - Recent molts
  - Recent acquisitions
- [ ] Top Performers:
  - Fastest growers
  - Most frequent molters
  - Best eaters (acceptance rate)
- [ ] Cost Tracking (optional):
  - Total spent
  - Average cost per T
  - Most expensive species

#### Frontend Work - Mobile:
- [ ] Add "Analytics" tab to bottom navigation
- [ ] Scrollable cards with stats
- [ ] Mini charts for distributions
- [ ] Pull-to-refresh to update stats

**Success Metrics:**
- Compelling "at-a-glance" view
- Data updates automatically
- Great for screenshots/sharing

---

## 🌐 Phase 3: Community & Social Features (4-5 weeks)

### Week 4: Discussion Forums
**Goal:** Create spaces for keepers to discuss topics

#### Backend Work:
- [ ] Create database tables:
  - `forum_categories` (General, Species, Health, Breeding, etc.)
  - `forum_topics` (thread title, category, user_id, pinned, locked)
  - `forum_posts` (topic_id, user_id, content, created_at)
  - `post_reactions` (post_id, user_id, reaction_type)
- [ ] Create API endpoints:
  - `GET /api/v1/forums/categories`
  - `GET /api/v1/forums/categories/{id}/topics`
  - `POST /api/v1/forums/topics` (create thread)
  - `GET /api/v1/forums/topics/{id}/posts`
  - `POST /api/v1/forums/posts` (reply to thread)
  - `POST /api/v1/forums/posts/{id}/react`

#### Frontend Work - Web:
- [ ] Create Forum page: `/community/forums`
- [ ] Category listing with topic counts
- [ ] Topic listing with pagination
- [ ] Thread view with nested replies
- [ ] Rich text editor for posts (TipTap or Slate)
- [ ] Markdown support
- [ ] Image upload in posts
- [ ] Reactions (like, helpful, funny)

#### Frontend Work - Mobile:
- [ ] Add "Community" tab
- [ ] Forum browser
- [ ] Thread viewer
- [ ] Reply composer
- [ ] Push notifications for replies

---

### Week 5: Following System & Activity Feed
**Goal:** Let users follow keepers and see their activity

#### Backend Work:
- [ ] Create `follows` table (follower_id, following_id)
- [ ] Create `activities` table (user_id, type, entity_id, created_at)
  - Types: new_tarantula, new_photo, molt_logged, etc.
- [ ] API endpoints:
  - `POST /api/v1/users/{id}/follow`
  - `DELETE /api/v1/users/{id}/unfollow`
  - `GET /api/v1/users/me/following`
  - `GET /api/v1/users/me/followers`
  - `GET /api/v1/feed` (activity feed from followed users)

#### Frontend Work:
- [ ] Add "Follow" button to keeper profiles
- [ ] Create Feed page showing followed users' activity
- [ ] Activity cards (new T, new photo, molt, etc.)
- [ ] Following/Followers list pages
- [ ] Notifications for new followers

---

### Week 6-7: Messaging System
**Goal:** Direct messages between users

#### Backend Work:
- [ ] Create tables:
  - `conversations` (id, participant_ids array, created_at)
  - `messages` (conversation_id, sender_id, content, created_at, read)
- [ ] WebSocket support for real-time messages
- [ ] API endpoints:
  - `GET /api/v1/conversations`
  - `POST /api/v1/conversations` (start new)
  - `GET /api/v1/conversations/{id}/messages`
  - `POST /api/v1/conversations/{id}/messages`
  - `PUT /api/v1/messages/{id}/read`

#### Frontend Work:
- [ ] Inbox page with conversation list
- [ ] Message thread view
- [ ] Real-time message updates
- [ ] Typing indicators
- [ ] Message notifications
- [ ] Block/report user functionality

---

### Week 8: Content Sharing & Galleries
**Goal:** Share photos and collections publicly

#### Backend Work:
- [ ] Create `posts` table:
  - user_id, tarantula_id (optional), content, image_urls, likes_count
- [ ] Create `post_likes` and `post_comments` tables
- [ ] API endpoints:
  - `GET /api/v1/posts` (public feed)
  - `POST /api/v1/posts`
  - `GET /api/v1/posts/{id}/comments`
  - `POST /api/v1/posts/{id}/like`

#### Frontend Work:
- [ ] Public feed page (Instagram-style)
- [ ] Photo grid galleries
- [ ] Like and comment functionality
- [ ] Share to social media integration

---

## 📱 Phase 3.5: Mobile App Polish (1-2 weeks)

### Week 9: Enhanced Mobile UX

#### Photo Enhancements:
- [ ] Long-press to delete photos (with confirmation)
- [ ] Add photo captions/notes input
- [ ] Drag-to-reorder photos in gallery
- [ ] Choose custom main photo (not just first)
- [ ] Bulk photo upload (select multiple)
- [ ] Photo zoom/pinch in viewer

#### UI/UX Improvements:
- [ ] Pull-to-refresh on all list screens
- [ ] Skeleton loaders while fetching
- [ ] Empty state illustrations (custom graphics)
- [ ] Swipe-to-delete on logs (feeding, molt)
- [ ] Haptic feedback on interactions
- [ ] Loading indicators on buttons

#### Quick Actions:
- [ ] Quick feeding log from collection (long-press card)
- [ ] Quick molt log from collection
- [ ] Swipe actions on collection cards (edit/delete/log)

---

### Week 10: Settings, Preferences & Polish

#### Settings Screen:
- [ ] Dark mode toggle
- [ ] Measurement units (imperial/metric)
- [ ] Temperature units (F/C)
- [ ] Date format preference
- [ ] Notification preferences
- [ ] Privacy settings
- [ ] Data export/backup
- [ ] About/Help section

#### Performance:
- [ ] Offline support (cache data locally)
- [ ] Image caching strategy
- [ ] Lazy loading for lists
- [ ] Background sync

#### App Store Prep:
- [ ] App icon design
- [ ] Splash screen
- [ ] Onboarding flow (3-4 screens)
- [ ] App Store screenshots
- [ ] Privacy policy
- [ ] Terms of service

---

## 🕷️💕 Phase 4: Breeding Tools (3-4 weeks)

### Week 11-12: Pairing & Egg Sac Management

#### Backend Work:
- [ ] Create tables:
  - `pairings` (male_id, female_id, paired_at, successful, notes)
  - `egg_sacs` (pairing_id, laid_at, pulled_at, count, status)
  - `offspring` (egg_sac_id, tarantula_id, sold_at, buyer, price)
- [ ] API endpoints:
  - `POST /api/v1/pairings`
  - `GET /api/v1/pairings`
  - `POST /api/v1/pairings/{id}/egg-sacs`
  - `GET /api/v1/egg-sacs/{id}/offspring`

#### Frontend Work:
- [ ] Pairing log screen (select male + female from collection)
- [ ] Pairing history view
- [ ] Egg sac tracker with status updates
- [ ] Countdown to estimated hatch date
- [ ] Offspring batch management

---

### Week 13-14: Offspring Tracking & Lineage

#### Backend Work:
- [ ] Lineage/pedigree calculation
- [ ] Breeding project organization
- [ ] Sales tracking

#### Frontend Work:
- [ ] Offspring list (kept vs sold)
- [ ] Individual sling management
- [ ] Batch feeding/molt logs
- [ ] Sales tracker
- [ ] Lineage tree visualization
- [ ] Breeding projects dashboard
- [ ] Success rate analytics

---

## 🎯 Success Milestones

### After Analytics (Week 3):
- [ ] Beautiful charts showing growth
- [ ] Feeding predictions working
- [ ] Dashboard impresses users

### After Community (Week 8):
- [ ] Active forum discussions
- [ ] Users following each other
- [ ] Messages being sent
- [ ] Public feed with activity

### After Mobile Polish (Week 10):
- [ ] App feels native and polished
- [ ] Quick actions save time
- [ ] Settings allow customization
- [ ] Ready for beta testing

### After Breeding Tools (Week 14):
- [ ] Breeders can track full lifecycle
- [ ] Lineage/pedigree view working
- [ ] Sales tracking integrated
- [ ] Ready for breeder marketing push

---

## 📊 Overall Timeline

**Total Duration:** ~14 weeks (3.5 months)

- **Weeks 1-3:** Analytics & Insights
- **Weeks 4-8:** Community & Social
- **Weeks 9-10:** Mobile Polish
- **Weeks 11-14:** Breeding Tools

**Target Completion:** Mid-January 2026

---

## 🚀 Let's Start!

Ready to begin with **Week 1: Growth Tracking**?

I'll help you build:
1. Growth analytics API endpoint
2. Beautiful charts (web + mobile)
3. Growth tab on detail pages

Let me know when you're ready! 💪
