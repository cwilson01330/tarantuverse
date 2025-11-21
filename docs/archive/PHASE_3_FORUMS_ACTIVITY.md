# Phase 3: Forums & Activity Feeds Implementation Plan

**Start Date:** October 8, 2025  
**Estimated Duration:** 3-4 weeks  
**Scope:** Community forums + Activity feed tracking (NO real-time chat)

---

## 🎯 Goals

1. **Community Forums**: Discussion threads organized by categories (species-specific, general care, breeding, etc.)
2. **Activity Feed**: Track and display user actions (new tarantulas, molts, feedings, follows, forum posts)
3. **Engagement**: Encourage community interaction and content discovery
4. **Moderation**: Basic tools for managing discussions (edit/delete/lock/pin)

---

## 📊 Database Schema

### New Tables

#### `forum_categories`
```sql
CREATE TABLE forum_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(50),  -- emoji or icon name
    display_order INT DEFAULT 0,
    thread_count INT DEFAULT 0,
    post_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### `forum_threads`
```sql
CREATE TABLE forum_threads (
    id SERIAL PRIMARY KEY,
    category_id INT REFERENCES forum_categories(id) ON DELETE CASCADE,
    author_id INT REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    view_count INT DEFAULT 0,
    post_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_post_at TIMESTAMP,
    last_post_user_id INT REFERENCES users(id)
);

CREATE INDEX idx_threads_category ON forum_threads(category_id);
CREATE INDEX idx_threads_author ON forum_threads(author_id);
CREATE INDEX idx_threads_updated ON forum_threads(updated_at DESC);
```

#### `forum_posts`
```sql
CREATE TABLE forum_posts (
    id SERIAL PRIMARY KEY,
    thread_id INT REFERENCES forum_threads(id) ON DELETE CASCADE,
    author_id INT REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_posts_thread ON forum_posts(thread_id);
CREATE INDEX idx_posts_author ON forum_posts(author_id);
CREATE INDEX idx_posts_created ON forum_posts(created_at);
```

#### `activity_feed`
```sql
CREATE TABLE activity_feed (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,  -- 'new_tarantula', 'molt', 'feeding', 'follow', 'forum_post', 'forum_thread'
    target_type VARCHAR(50),  -- 'tarantula', 'user', 'thread', 'post'
    target_id INT,
    metadata JSONB,  -- flexible storage for action-specific data
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activity_user ON activity_feed(user_id);
CREATE INDEX idx_activity_created ON activity_feed(created_at DESC);
CREATE INDEX idx_activity_type ON activity_feed(action_type);
```

---

## 🔧 Backend API Endpoints

### Forums (`/api/v1/forums`)

#### Categories
- `GET /api/v1/forums/categories` - List all categories with stats
- `POST /api/v1/forums/categories` - Create category (admin only)
- `PATCH /api/v1/forums/categories/{id}` - Update category (admin only)
- `DELETE /api/v1/forums/categories/{id}` - Delete category (admin only)

#### Threads
- `GET /api/v1/forums/categories/{slug}/threads` - List threads in category
  - Query params: `page`, `limit`, `sort` (recent/popular/pinned)
- `GET /api/v1/forums/threads/{id}` - Get thread details
- `POST /api/v1/forums/threads` - Create new thread
- `PATCH /api/v1/forums/threads/{id}` - Update thread (author or admin)
- `DELETE /api/v1/forums/threads/{id}` - Delete thread (author or admin)
- `POST /api/v1/forums/threads/{id}/pin` - Pin thread (admin only)
- `POST /api/v1/forums/threads/{id}/lock` - Lock thread (admin only)

#### Posts
- `GET /api/v1/forums/threads/{id}/posts` - List posts in thread
  - Query params: `page`, `limit`
- `POST /api/v1/forums/threads/{id}/posts` - Create post (reply)
- `PATCH /api/v1/forums/posts/{id}` - Edit post (author or admin)
- `DELETE /api/v1/forums/posts/{id}` - Delete post (author or admin)

### Activity Feed (`/api/v1/activity`)

- `GET /api/v1/activity/feed` - Get personalized feed (following users)
  - Shows activity from users you follow
  - Query params: `page`, `limit`, `action_type`
- `GET /api/v1/activity/global` - Get global activity feed
  - Shows all public activity
  - Query params: `page`, `limit`, `action_type`
- `GET /api/v1/activity/user/{username}` - Get specific user's activity
  - Shows activity for one user
  - Query params: `page`, `limit`, `action_type`

---

## 🎨 Frontend - Web

### New Pages

1. **`/community/forums`** - Forum home
   - List all categories with stats (threads, posts, last activity)
   - Recent activity sidebar
   - "New Thread" button

2. **`/community/forums/[category]`** - Category view
   - List threads in category
   - Filters: All/Pinned/My Threads
   - Sort: Recent/Popular
   - "New Thread" button

3. **`/community/forums/thread/[id]`** - Thread view
   - Original post + all replies
   - Reply form at bottom
   - Edit/Delete buttons (own posts)
   - Pin/Lock buttons (admin)
   - Breadcrumb navigation

### Updated Pages

1. **`/dashboard`** - Add activity feed widget
   - Show recent activity from followed users
   - "View All" link to full feed

2. **`/community`** - Add global activity feed tab
   - Tabs: Keepers / Activity Feed / Forums

### New Components

- `ForumCategoryCard` - Category display with stats
- `ThreadListItem` - Thread in list view
- `ForumPost` - Individual post with author info
- `NewThreadForm` - Create thread modal/page
- `ActivityFeedItem` - Activity card with icon and details
- `ActivityFeedFilter` - Filter by action type

---

## 📱 Frontend - Mobile

### New Screens

1. **`app/(tabs)/forums.tsx`** - Forum tab
   - List categories
   - Search bar
   - Recent threads section

2. **`app/forums/[category].tsx`** - Category screen
   - Thread list with native feel
   - Pull-to-refresh
   - "New Thread" FAB

3. **`app/forums/thread/[id].tsx`** - Thread screen
   - Posts in FlatList
   - Reply input at bottom
   - Swipe actions (edit/delete own posts)

### Updated Screens

1. **`app/(tabs)/index.tsx`** - Add activity feed section
   - Recent activity from followed users
   - Compact cards
   - "See All" link

2. **`app/(tabs)/community.tsx`** - Add activity tab
   - Segmented control: Keepers / Activity / Forums
   - Pull-to-refresh

---

## 🔄 Activity Tracking Implementation

### Trigger Points

Add activity logging to existing endpoints:

1. **New Tarantula** - `POST /api/v1/tarantulas`
   ```python
   await create_activity(
       user_id=user.id,
       action_type="new_tarantula",
       target_type="tarantula",
       target_id=tarantula.id,
       metadata={"species": tarantula.species.common_name}
   )
   ```

2. **Molt Logged** - `POST /api/v1/tarantulas/{id}/molts`
   ```python
   await create_activity(
       user_id=user.id,
       action_type="molt",
       target_type="tarantula",
       target_id=tarantula_id,
       metadata={"name": tarantula.name}
   )
   ```

3. **Feeding Logged** - `POST /api/v1/tarantulas/{id}/feedings`
   ```python
   await create_activity(
       user_id=user.id,
       action_type="feeding",
       target_type="tarantula",
       target_id=tarantula_id,
       metadata={"name": tarantula.name, "prey": prey_type}
   )
   ```

4. **User Followed** - `POST /api/v1/follows/{username}`
   ```python
   await create_activity(
       user_id=user.id,
       action_type="follow",
       target_type="user",
       target_id=followed_user.id,
       metadata={"username": followed_user.username}
   )
   ```

5. **Forum Thread Created** - `POST /api/v1/forums/threads`
   ```python
   await create_activity(
       user_id=user.id,
       action_type="forum_thread",
       target_type="thread",
       target_id=thread.id,
       metadata={"title": thread.title, "category": category.name}
   )
   ```

6. **Forum Post Created** - `POST /api/v1/forums/threads/{id}/posts`
   ```python
   await create_activity(
       user_id=user.id,
       action_type="forum_post",
       target_type="post",
       target_id=post.id,
       metadata={"thread_title": thread.title}
   )
   ```

---

## 🎯 Week-by-Week Plan

### Week 1: Database & Backend Foundation
**Days 1-2:**
- Create Alembic migration for 4 new tables
- Run migration locally and test
- Add `is_admin` field to users table (for moderation)

**Days 3-5:**
- Build `routers/forums.py` with all category/thread/post endpoints
- Build `routers/activity.py` with feed endpoints
- Create Pydantic schemas for forums and activity
- Add helper function `create_activity()` in services

**Day 6-7:**
- Test all endpoints with Postman/curl
- Seed initial forum categories (General, Species-Specific, Care, Breeding)
- Create test threads and posts

### Week 2: Web Frontend - Forums
**Days 1-2:**
- Install any needed UI libraries (markdown editor?)
- Create forum page structure (`/community/forums`)
- Build ForumCategoryCard component

**Days 3-4:**
- Build category page (`/community/forums/[category]`)
- ThreadListItem component with stats
- NewThreadForm component

**Days 5-7:**
- Build thread page (`/community/forums/thread/[id]`)
- ForumPost component with author info
- Reply form with markdown support
- Edit/Delete functionality

### Week 3: Web Frontend - Activity Feed + Mobile
**Days 1-2:**
- Build ActivityFeedItem component
- Add activity feed to dashboard
- Add activity feed tab to community page
- Filter/sorting controls

**Days 3-4:**
- Create mobile forum tab layout
- Build category list screen
- Thread list screen with native feel

**Days 5-7:**
- Build thread detail screen for mobile
- Reply input with keyboard handling
- Activity feed on mobile dashboard
- Pull-to-refresh on all screens

### Week 4: Activity Tracking + Moderation + Polish
**Days 1-2:**
- Add activity logging to all existing endpoints:
  - Tarantula CRUD
  - Molt logging
  - Feeding logging
  - Follow actions
- Test activity appears in feeds

**Days 3-4:**
- Add moderation endpoints (pin/lock/delete)
- Add admin flag to user model
- Build moderation UI (admin only buttons)
- Test moderation features

**Days 5-7:**
- Polish UI (loading states, error handling)
- Test entire flow on web + mobile
- Fix bugs
- Update documentation
- Run migration on Render
- Deploy to production

---

## 📋 Initial Forum Categories

1. **🌍 General Discussion**
   - Introductions, general chat, off-topic
   
2. **🕷️ Species-Specific**
   - Discuss specific species, care requirements, behavior

3. **📚 Care & Husbandry**
   - Feeding, housing, substrate, troubleshooting

4. **🔬 Breeding & Genetics**
   - Pairing, egg sacs, genetics, morph discussion

5. **📸 Photos & Videos**
   - Show off your Ts, share media

6. **🛠️ DIY & Enclosures**
   - Enclosure builds, custom setups, crafts

7. **💬 Community & Events**
   - Meetups, expos, community announcements

---

## 🚀 Success Metrics

- ✅ Users can create threads and posts
- ✅ Activity feed shows relevant actions
- ✅ Feed updates when following users
- ✅ Moderation tools work (pin/lock/delete)
- ✅ Forums are engaging and easy to navigate
- ✅ Mobile experience feels native
- ✅ No real-time chat needed (async discussion works)

---

## 🎨 Design Notes

### Activity Feed Item Examples

**New Tarantula:**
```
🕷️ [username] added a new tarantula: "Rosie" (Grammostola rosea)
   2 hours ago
```

**Molt:**
```
🦗 [username]'s "Spidey" molted successfully!
   5 hours ago
```

**Follow:**
```
👤 [username] started following [other_user]
   1 day ago
```

**Forum Thread:**
```
💬 [username] started a thread: "Tips for first-time G. rosea keepers?"
   in Care & Husbandry
   3 days ago
```

### Forum Thread Display
```
[📌 Pinned] [🔒 Locked]
Title: "Official Species Identification Thread"
by username • 45 replies • Last reply 2h ago by other_user
```

---

## 🔐 Security Considerations

1. **Post Ownership**: Users can only edit/delete their own posts
2. **Admin Rights**: Pin/lock/delete others' content requires `is_admin=True`
3. **Rate Limiting**: Limit post creation (e.g., 1 post per minute)
4. **Content Validation**: Sanitize HTML/markdown, prevent XSS
5. **Spam Prevention**: Consider captcha or email verification for new users

---

## 📝 Next Steps After This Phase

After forums + activity feeds are complete, we can consider:
- **Likes/Reactions** on forum posts and activity items
- **Notifications** for replies, mentions, follows
- **Search** across forum content
- **Tags/Categories** for threads
- **User Reputation** system (upvotes, helpful marks)
- **Rich Media** in posts (embedded images, videos)

---

**Ready to start with Week 1: Database & Backend Foundation?** 🚀
