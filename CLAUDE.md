# Tarantuverse - Project Documentation for Claude

## Project Overview

**Tarantuverse** is a comprehensive tarantula (and invertebrate) husbandry tracking platform designed to help keepers manage their collections, track feeding/molting/substrate changes, access species care information, connect with other keepers, and manage breeding projects.

**Tech Stack:**
- **Frontend**: Next.js 14 (React 19), TypeScript, Tailwind CSS, next-themes
- **Mobile**: React Native, Expo Router, TypeScript
- **Backend**: FastAPI (Python), SQLAlchemy 2.0, Pydantic v2
- **Database**: PostgreSQL (Neon)
- **Storage**: Cloudflare R2 (photos and thumbnails)
- **Deployment**:
  - API: Render (https://tarantuverse-api.onrender.com)
  - Web: Vercel
- **Monorepo**: pnpm workspaces with Turborepo

---

## 🎯 Current Status (As of 2025-11-22)

### ✅ Completed Features

#### Authentication & User Management
- **Traditional Authentication**:
  - User registration with email, username, password
  - JWT token-based authentication
  - Login/logout functionality
  - Password hashing with bcrypt (truncated to 72 chars)

- **OAuth Authentication** 🆕:
  - OAuth provider support (Google, Apple, GitHub)
  - OAuth fields: `oauth_provider`, `oauth_id`, `oauth_access_token`, `oauth_refresh_token`
  - `hashed_password` nullable for OAuth-only users
  - Index for fast OAuth provider lookups

- **User Profiles**:
  - Basic: `display_name`, `avatar_url`, `bio`
  - Community: `profile_bio`, `profile_location`, `profile_experience_level`
  - Experience: `profile_years_keeping`, `profile_specialties` (array)
  - Social: `social_links` (JSONB), `collection_visibility` (private/public)
  - Roles: `is_active`, `is_superuser`, `is_breeder`, `is_admin`

#### Tarantula Collection Management (CRUD)
- **Basic Information**:
  - Common name, scientific name
  - Sex (male/female/unknown)
  - Date acquired, source (bred/bought/wild_caught), price paid
  - Photo URL
  - Notes
  - Species linkage (optional `species_id`)

- **Comprehensive Husbandry Fields**:
  - `enclosure_type`: terrestrial, arboreal, fossorial
  - `enclosure_size`: e.g., "10x10x10 inches"
  - `substrate_type`: e.g., "coco fiber"
  - `substrate_depth`: e.g., "3 inches"
  - `last_substrate_change`: date
  - `target_temp_min` / `target_temp_max`: Fahrenheit
  - `target_humidity_min` / `target_humidity_max`: percentage
  - `water_dish`: boolean
  - `misting_schedule`: e.g., "2x per week"
  - `last_enclosure_cleaning`: date
  - `enclosure_notes`: text for modifications, decor

- **CRUD Operations**:
  - View individual tarantula details
  - Edit tarantula information
  - Delete tarantulas (with confirmation)
  - Dashboard collection grid display
  - Collection count statistics
  - Dedicated husbandry page: `/dashboard/tarantulas/[id]/husbandry`

#### Photo Management System 📸 (✅ COMPLETE)
- **Database**: `photos` table
  - Fields: `id`, `tarantula_id`, `url`, `thumbnail_url`, `caption`, `taken_at`, `created_at`
  - Relationship to tarantulas

- **Storage**: Cloudflare R2 integration
  - Automatic thumbnail generation
  - Upload endpoints with authentication

- **Mobile**:
  - Camera integration for taking photos
  - Gallery picker for existing photos
  - PhotoViewer component with swipe navigation

- **Web**: Photo upload and display
- **API**: Complete CRUD endpoints in `photos.py` router

#### Feeding Log Tracking
- Add feeding logs with:
  - Date & time fed
  - Food type (cricket, roach, mealworm, etc.)
  - Food size (small/medium/large)
  - Accepted (yes/no)
  - Notes
- View feeding history (sorted by date, newest first)
- Delete feeding logs
- Inline form on tarantula detail page

#### Molt Log Tracking
- Add molt logs with:
  - Molt date & time
  - Premolt start date (optional)
  - Leg span before/after (inches)
  - Weight before/after (grams)
  - Notes
  - Molt photo URL
- View molt history (sorted by date, newest first)
- Display growth measurements (before → after)
- Delete molt logs
- Inline form on tarantula detail page

#### Substrate Change Tracking (✅ COMPLETE)
- **Model**: `substrate_changes` table
- Track substrate changes over time:
  - Date changed
  - Substrate type
  - Substrate depth
  - Reason (routine maintenance, mold, rehousing, etc.)
  - Notes
- API endpoints ready (GET, POST, PUT, DELETE)
- **Automatically updates** tarantula's `last_substrate_change`, `substrate_type`, and `substrate_depth` when logged
- **UI**: Inline form and log display on tarantula detail page

#### Species Database & Care Sheets
- **Comprehensive species model with 40+ fields**:
  - Taxonomy: scientific_name, common_names, genus, family
  - Care level (beginner/intermediate/advanced)
  - Temperament, native region, adult size, growth rate
  - Type (terrestrial/arboreal/fossorial)
  - **Climate**: temperature ranges (F), humidity ranges (%)
  - **Enclosure**: sizes for sling/juvenile/adult, substrate depth/type
  - **Feeding**: frequencies for each life stage, prey size
  - **Behavior**: water dish required, webbing amount, burrowing
  - **Safety** 🆕:
    - `urticating_hairs` (Boolean) - New World species
    - `medically_significant_venom` (Boolean) - Old World arboreals (Poecilotheria, etc.)
  - Care guide (long-form text)
  - Image URL, source URL
  - **Community**: `is_verified`, `submitted_by`, `community_rating`, `times_kept`

- **Features**:
  - Case-insensitive search using `scientific_name_lower` field
  - Search by scientific or common name (autocomplete)
  - Species detail page (care sheet viewer) with full husbandry info
  - Safety badges and warnings displayed prominently
  - Species list/search page: `/species`

- **Species Autocomplete Component**:
  - Debounced search (300ms)
  - Dropdown with species results
  - Click outside to close
  - Shows species image/emoji and care level badges

- **Data Management**:
  - Seeded with 10+ species (beginner to advanced)
  - Species images sourced and added
  - **Obsidian Vault Import Tool**: `import_obsidian_species.py` can parse markdown files and bulk import species
  - Admin tools for updating species data

#### Breeding Module 🧬 (✅ COMPLETE)
**Full breeding tracking system for serious breeders**

- **Pairing Management**:
  - Database: `pairings` table
  - Track male/female pairing attempts
  - Fields: `paired_date`, `separated_date`, `pairing_type` (natural/assisted/forced)
  - Outcome tracking: successful, unsuccessful, in_progress, unknown
  - Notes for each pairing
  - Relationships to both male and female tarantulas

- **Egg Sac Tracking**:
  - Database: `egg_sacs` table
  - Link to parent pairing
  - Track incubation conditions
  - Monitor development stages
  - Record hatch dates and success rates

- **Offspring Management**:
  - Database: `offspring` table
  - Individual offspring records
  - Track sales/trades/retention
  - Status tracking (available, sold, kept, deceased)
  - Link back to parent pairing

- **UI**:
  - `/dashboard/breeding` - Overview page with all breeding projects
  - `/dashboard/breeding/pairings/add` - Record new pairing
  - `/dashboard/breeding/egg-sacs/add` - Log egg sac
  - `/dashboard/breeding/offspring/add` - Record offspring
  - Breeding tab on individual tarantula detail pages
  - Activity feed integration for breeding events

- **API**: Complete CRUD endpoints
  - `pairings.py` router
  - `egg_sacs.py` router
  - `offspring.py` router

#### Community Features 🌐 (✅ COMPLETE)
**Full social networking and community engagement platform**

##### Forums System
- **Database**: `forum.py` models
  - Message (threads)
  - MessageReply (comments)
  - MessageLike (likes)
  - MessageReaction (emoji reactions)

- **Features**:
  - Create discussion threads by category
  - Reply to threads
  - Like and react to posts
  - Forum moderation (`is_admin` role)
  - Category-based organization

- **Web Pages**:
  - `/community/forums` - Forum list
  - `/community/forums/[category]` - Category view
  - `/community/forums/[category]/new` - Create thread
  - `/community/forums/thread/[id]` - Thread detail with replies

- **Mobile**: Full forum navigation in tabs

##### Activity Feed
- **Database**: `activity_feed.py` model
- Track all user activities:
  - New tarantulas added
  - Feeding logs
  - Molt events
  - Breeding activities
  - Forum posts
  - Collection updates

- **Components**:
  - `ActivityFeed.tsx` - Feed display
  - `ActivityFeedItem.tsx` - Individual activity rendering

- **Pages**:
  - `/community/board` - Community activity board
  - Integrated into keeper profiles

##### Follow System
- **Database**: `follow.py` model
- Follow other keepers
- See followers/following lists
- Activity feed filtered by followed users
- API endpoints for follow/unfollow actions

##### Direct Messaging
- **Database**: `direct_message.py` model
- Private messaging between users
- **Web Pages**:
  - `/messages` - Message inbox
  - `/messages/[username]` - Conversation view
- **Mobile**: DM screens implemented
- Real-time conversation threads

##### Keeper Profiles
- **Public Profile Pages**:
  - `/keeper/[username]` - Public keeper profile
  - `/community/[username]` - Alternative route

- **Profile Content**:
  - Bio and experience level
  - Years keeping
  - Specialties (arboreal, old world, breeding, etc.)
  - Social links (Instagram, YouTube, website)
  - Public collection (if `collection_visibility` = 'public')
  - Activity history
  - Follower/following counts

- **API**: `keepers.py` router with profile endpoints

##### Community Board
- **Page**: `/community/board`
- Aggregated community activity
- Recent discussions
- Popular species
- Active keepers

#### Analytics & Statistics 📊 (✅ COMPLETE)
- **Feeding Statistics**:
  - Acceptance rate with color coding
  - Average days between feedings
  - Current streak (consecutive accepted feedings)
  - Longest gap between feedings
  - Last fed indicator with status colors:
    - Green: <7 days
    - Yellow: 7-14 days
    - Orange: 14-21 days
    - Red: >21 days
  - Next feeding prediction
  - Prey type distribution (visual bar chart)
  - Interactive Recharts visualizations

- **Growth Analytics**:
  - Line chart showing weight and leg span over time
  - Growth rate calculations
  - Days between molts
  - Visual tracking of development
  - Molt history timeline

- **Collection Statistics**:
  - Total tarantulas
  - Breakdown by species
  - Sex distribution
  - Age distribution
  - Feeding status overview

- **Dedicated Analytics Pages**:
  - Web: `/dashboard/analytics`
  - Mobile: `/analytics/index.tsx`

- **API**: Dedicated `analytics.py` router with endpoints:
  - `GET /tarantulas/{id}/feeding-stats`
  - `GET /tarantulas/{id}/growth`

#### Subscription/Premium System 💎 (Backend Ready)
- **Database**: `subscription.py` model
- Backend infrastructure complete
- API: `subscriptions.py` router
- Migration: `j1k2l3m4n5o6_add_subscription_tables.py`
- **Web Page**: `/pricing` - Pricing tiers page
- User relationship ready (temporarily commented for deployment)

#### Notification System 🔔 (✅ COMPLETE)
**Comprehensive notification system across mobile and web platforms**

- **Database**: `notification_preferences` table
  - User-specific notification settings
  - Per-user Expo push token storage
  - Quiet hours configuration
  - Individual toggles for each notification type

- **Local Notifications (Mobile)**:
  - Feeding reminders (customizable hours)
  - Substrate change reminders (customizable days)
  - Molt prediction notifications (≥70% probability)
  - Maintenance reminders (manual scheduling)
  - Auto-scheduling based on user preferences

- **Push Notifications (Mobile & Web)**:
  - Direct message notifications
  - Forum reply notifications
  - New follower notifications
  - Community activity alerts
  - Expo Push Notification Service integration
  - Real-time delivery via httpx

- **Web Features**:
  - `/dashboard/settings/notifications` - Full settings page
  - Notification bell icon with unread count
  - Auto-refreshing message counter (30s polling)
  - Navigate to messages on bell click
  - Dark mode support

- **Mobile Features**:
  - Complete notification settings screen
  - Permission requests for notifications
  - Expo push token registration
  - Notification scheduling service
  - AsyncStorage for notification IDs

- **API**:
  - `notification_preferences.py` router
  - Push notification utility (`push_notifications.py`)
  - Integrated into DMs, forums, and follows routers
  - GET/PUT endpoints for preferences

#### Admin Tools 👨‍💼 (✅ COMPLETE)
**Administrative interfaces for platform management**

- **Species Management**:
  - `/dashboard/admin/species/manage` - Complete CRUD interface
  - Searchable species table with inline editing
  - Edit scientific name, common names, genus, type
  - Verification status toggle
  - Delete functionality with confirmation
  - Filter by verification status
  - Admin-only access control

- **User Management**:
  - `make_admin.py` script for role assignment
  - Command-line user promotion/demotion

#### Branding & Assets 🎨 (✅ COMPLETE)
**Professional branding implementation**

- **Logo Design**: Purple-to-pink gradient tarantula silhouette
- **Web Implementation**:
  - Sidebar logo (expanded and collapsed states)
  - Favicon (`/logo-transparent.png`)
  - Landing page navigation and footer
  - Replaced spider emoji throughout

- **Mobile Implementation**:
  - App icon (`icon.png` - dark background)
  - Adaptive icon for Android (`adaptive-icon.png`)
  - iOS app icon configuration
  - Consistent branding across all screens

- **File Locations**:
  - `/apps/web/public/logo.png` (solid background)
  - `/apps/web/public/logo-transparent.png` (transparent)
  - `/apps/mobile/assets/icon.png` (dark background)
  - `/apps/mobile/assets/adaptive-icon.png` (transparent)

#### User Interface Features

##### Modern Navigation System 🧭 (✅ COMPLETE)
**2025 best practices - persistent sidebar design**

- **Components**:
  - `Sidebar.tsx` - Persistent left sidebar
    - Icon + label navigation
    - Collapsible for desktop (saves screen space)
    - Active route highlighting with gradients
    - Smooth transitions
  - `TopBar.tsx` - Compact top bar
    - Theme toggle (light/dark)
    - Notifications icon
    - User menu with avatar
    - Minimal and clean
  - `DashboardLayout.tsx` - Wrapper combining both

- **Mobile**:
  - Hamburger menu
  - Slide-in sidebar drawer
  - Touch-friendly navigation

- **Features**:
  - No more top-spanning button clutter
  - Space-efficient design
  - Professional UX patterns
  - Consistent across all dashboard pages

##### Dashboard & Collection Display
- **Main Dashboard**: Collection overview with statistics
- **Collection Cards**:
  - Grid layout with photos
  - Feeding status badges (color-coded):
    - Days since last feeding
    - Visual warnings for overdue feedings
    - Available on both web and mobile
  - Quick access to tarantula details

##### Tarantula Detail Page
- Photo or spider emoji (🕷️) display
- Basic info grid (sex, acquired date, source, price)
- **Husbandry Information Section** (conditionally shown):
  - Enclosure type, size
  - Substrate type & depth
  - Last substrate change date
  - Target temperature and humidity ranges
  - Water dish status
  - Misting schedule
  - Last enclosure cleaning date
  - Enclosure notes
- **"View Care Sheet" button** (📖):
  - Links to species care sheet when `species_id` is present
  - Allows keepers to compare their setup vs recommended care
- **Feeding Stats Card** 🍽️📊:
  - All feeding analytics in visual cards
  - Interactive charts (Recharts)
  - Full dark mode support
- **Growth Analytics Chart** 📈:
  - Weight and leg span progression
  - Growth rate insights
- **Logs & History**:
  - Feeding logs with inline add/delete
  - Molt logs with inline add/delete
  - Substrate change logs with inline add/delete
  - Breeding tab (if used in breeding)
- Edit and Delete buttons (with confirmation)

##### Forms & Input
- **Add Tarantula Form**:
  - Species autocomplete integration
  - Auto-fill scientific/common name from species selection
  - All basic and husbandry fields
  - Photo upload support

- **Add Feeding/Molt/Substrate Logs**:
  - Inline forms on detail pages
  - Date/time pickers
  - Validation

##### Species Care Sheet Page
- Beautiful display of all care requirements
- Organized sections:
  - Taxonomy
  - Climate requirements
  - Enclosure specifications
  - Substrate recommendations
  - Feeding schedule by life stage
  - Behavioral traits
  - Safety information (urticating hairs, venom)
- Shows community stats (times kept, rating)
- Link to source
- Prominent safety badges for dangerous species

##### Global Styling & Theme System 🌙
- **Professional branding** with purple-to-pink gradient tarantula logo
- **Tailwind CSS** with custom primary color (`#8B4513` - brown/earth tones)
- **Complete Dark Mode Support** (Web & Mobile):
  - **Web**: Tailwind `dark:` modifiers on all components
    - Backgrounds: `bg-white dark:bg-gray-800`
    - Text: `text-gray-900 dark:text-white`
    - Borders: `border-gray-200 dark:border-gray-700`
    - All buttons, cards, inputs, modals, charts
  - **Mobile**: ThemeContext with dynamic color system
    - Colors: `theme.background`, `theme.surface`, `theme.text`, etc.
    - Never hardcoded colors
  - **Features**:
    - Smooth theme transitions
    - System-wide consistency
    - next-themes integration on web
    - ThemeContext on mobile
  - **Coverage**: All pages, components, modals, charts, loading states, skeletons
- Responsive grid layouts
- Consistent button and form styling

##### Additional Pages
**Marketing/Info**:
- `/` - Landing page (redesigned with 2025 best practices)
- `/features` - Feature showcase
- `/pricing` - Pricing tiers
- `/help` - Help center
- `/contact` - Contact form
- `/blog` - Blog framework
- `/privacy` - Privacy policy

**Settings**:
- `/dashboard/settings` - Main settings page
- `/dashboard/settings/profile` - Profile editor

#### Mobile App (React Native + Expo) 📱 (✅ COMPLETE)
**Full feature parity with web app**

- **Tech Stack**:
  - React Native
  - Expo Router for navigation
  - TypeScript
  - Expo Go for development
  - EAS Build for production

- **Authentication**:
  - Login, registration
  - JWT token management
  - AuthContext for state

- **Collection Management**:
  - View all tarantulas in grid layout with photos
  - Tarantula detail screen with all information
  - Add new tarantulas with form
  - Edit existing tarantulas
  - Delete tarantulas

- **Tracking**:
  - View/add feeding logs
  - View/add molt logs
  - View/add substrate changes
  - Photo management

- **Photo Features**:
  - Camera integration
  - Gallery picker
  - PhotoViewer with swipe navigation
  - Cloudflare R2 upload
  - Thumbnail display

- **Community** 🆕:
  - Forums integration
  - Community board
  - Direct messaging
  - Keeper profiles
  - Activity feed

- **Analytics & Stats**:
  - FeedingStatsCard with themed styling
  - GrowthChart component
  - Collection statistics
  - Dedicated analytics screen

- **Dark Mode**:
  - Complete ThemeContext system
  - All screens and components themed
  - Smooth theme switching

- **Additional Screens**:
  - Species browser and care sheets
  - Settings
  - Privacy policy

---

## 🏗️ Architecture & File Structure

### Backend Structure (`apps/api/`)

```
apps/api/
├── alembic/
│   └── versions/
│       ├── 9588b399ad54_initial_migration.py
│       ├── a1b2c3d4e5f6_add_photo_url_to_tarantulas.py
│       ├── b2c3d4e5f6g7_expand_species_model.py
│       ├── c3d4e5f6g7h8_add_husbandry_and_substrate_changes.py
│       ├── d1e2f3g4h5i6_add_community_features.py
│       ├── e2f3g4h5i6j7_add_messages_table.py
│       ├── f3g4h5i6j7k8_add_message_interactions.py
│       ├── g4h5i6j7k8l9_add_follow_and_direct_messaging_models.py
│       ├── h5i6j7k8l9m0_add_forums_and_activity_feed.py
│       ├── i6j7k8l9m0n1_change_activity_target_id_to_string.py
│       ├── j1k2l3m4n5o6_add_subscription_tables.py
│       ├── add_oauth_fields.py (oauth_fields_001)
│       ├── add_safety_fields_to_species.py
│       ├── k2l3m4n5o6p7_add_breeding_module.py
│       └── l3m4n5o6p7q8_add_notification_preferences.py
├── app/
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py (UPDATED: OAuth, profile fields, breeding relationships)
│   │   ├── tarantula.py (UPDATED: husbandry fields, breeding relationships)
│   │   ├── species.py (UPDATED: safety fields)
│   │   ├── feeding_log.py
│   │   ├── molt_log.py
│   │   ├── substrate_change.py
│   │   ├── photo.py (NEW)
│   │   ├── pairing.py (NEW - breeding)
│   │   ├── egg_sac.py (NEW - breeding)
│   │   ├── offspring.py (NEW - breeding)
│   │   ├── message.py (NEW - community board, legacy)
│   │   ├── message_reply.py (NEW - community)
│   │   ├── message_like.py (NEW - community)
│   │   ├── message_reaction.py (NEW - community)
│   │   ├── follow.py (NEW - community)
│   │   ├── direct_message.py (NEW - community)
│   │   ├── forum.py (NEW - community)
│   │   ├── activity_feed.py (NEW - community)
│   │   ├── subscription.py (NEW - premium)
│   │   └── notification_preference.py (NEW - notifications)
│   ├── schemas/
│   │   ├── user.py
│   │   ├── tarantula.py (UPDATED: husbandry fields)
│   │   ├── species.py (UPDATED: safety fields)
│   │   ├── feeding_log.py
│   │   ├── molt.py
│   │   ├── substrate_change.py
│   │   └── [schemas for all new models]
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth.py (JWT authentication)
│   │   ├── tarantulas.py (FIXED: trailing slash, model_dump())
│   │   ├── species.py
│   │   ├── feedings.py
│   │   ├── molts.py
│   │   ├── substrate_changes.py
│   │   ├── photos.py (NEW)
│   │   ├── analytics.py (NEW - dedicated analytics)
│   │   ├── pairings.py (NEW - breeding)
│   │   ├── egg_sacs.py (NEW - breeding)
│   │   ├── offspring.py (NEW - breeding)
│   │   ├── keepers.py (NEW - community)
│   │   ├── messages.py (NEW - community board)
│   │   ├── follows.py (NEW - community, UPDATED: push notifications)
│   │   ├── direct_messages.py (NEW - community, UPDATED: push notifications)
│   │   ├── forums.py (NEW - community, UPDATED: push notifications)
│   │   ├── activity.py (NEW - community)
│   │   ├── subscriptions.py (NEW - premium)
│   │   └── notification_preferences.py (NEW - notifications)
│   ├── utils/
│   │   ├── auth.py (JWT token creation, password hashing)
│   │   ├── dependencies.py (get_current_user with HTTPBearer)
│   │   └── push_notifications.py (NEW - Expo push notification service)
│   ├── config.py (settings from environment)
│   ├── database.py (SQLAlchemy setup)
│   └── main.py (FastAPI app with CORS, all routers registered, /uploads mount)
├── uploads/
│   ├── photos/
│   └── thumbnails/
├── seed_species.py (seed species)
├── seed_via_api.py (seed via API)
├── import_obsidian_species.py (parse Obsidian markdown)
├── make_admin.py (user management script)
└── start.sh (runs migrations, starts uvicorn)
```

### Frontend Structure (`apps/web/`)

```
apps/web/
├── public/
│   ├── logo.png (professional tarantula logo - solid background)
│   ├── logo-transparent.png (favicon and brand assets)
│   ├── 404.html (static error page)
│   └── 500.html (static error page)
├── src/
│   ├── app/
│   │   ├── layout.tsx (metadata, favicon, theme provider)
│   │   ├── page.tsx (landing page - redesigned)
│   │   ├── not-found.tsx (404 handler)
│   │   ├── error.tsx (error handler)
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── dashboard/
│   │   │   ├── page.tsx (collection overview)
│   │   │   ├── analytics/page.tsx (NEW)
│   │   │   ├── settings/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── profile/page.tsx
│   │   │   │   └── notifications/page.tsx (NEW - notification settings)
│   │   │   ├── admin/ (NEW - admin tools)
│   │   │   │   └── species/
│   │   │   │       └── manage/page.tsx (NEW - species CRUD)
│   │   │   ├── breeding/ (NEW)
│   │   │   │   ├── page.tsx (overview)
│   │   │   │   ├── pairings/add/page.tsx
│   │   │   │   ├── egg-sacs/add/page.tsx
│   │   │   │   └── offspring/add/page.tsx
│   │   │   └── tarantulas/
│   │   │       ├── add/page.tsx
│   │   │       └── [id]/
│   │   │           ├── page.tsx (detail - with breeding tab)
│   │   │           ├── edit/page.tsx
│   │   │           └── husbandry/page.tsx (NEW)
│   │   ├── species/
│   │   │   ├── page.tsx (NEW - species list)
│   │   │   └── [id]/page.tsx (care sheet)
│   │   ├── community/ (NEW)
│   │   │   ├── page.tsx
│   │   │   ├── board/page.tsx
│   │   │   ├── [username]/page.tsx (keeper profile)
│   │   │   └── forums/
│   │   │       ├── page.tsx
│   │   │       ├── [category]/page.tsx
│   │   │       ├── [category]/new/page.tsx
│   │   │       └── thread/[id]/page.tsx
│   │   ├── keeper/[username]/page.tsx (NEW)
│   │   ├── messages/ (NEW)
│   │   │   ├── page.tsx
│   │   │   └── [username]/page.tsx
│   │   ├── features/page.tsx (NEW)
│   │   ├── pricing/page.tsx (NEW)
│   │   ├── help/page.tsx (NEW)
│   │   ├── contact/page.tsx (NEW)
│   │   ├── blog/page.tsx (NEW)
│   │   └── privacy/page.tsx (NEW)
│   ├── components/
│   │   ├── SpeciesAutocomplete.tsx
│   │   ├── FeedingStatsCard.tsx (with Recharts)
│   │   ├── GrowthChart.tsx
│   │   ├── Sidebar.tsx (NEW - modern navigation with logo)
│   │   ├── TopBar.tsx (NEW - compact top bar with notification bell)
│   │   ├── DashboardLayout.tsx (NEW - layout wrapper)
│   │   ├── ThemeProvider.tsx (NEW - next-themes)
│   │   ├── Providers.tsx (NEW)
│   │   ├── ActivityFeed.tsx (NEW)
│   │   └── ActivityFeedItem.tsx (NEW)
│   └── globals.css (Tailwind + dark mode + global styles)
├── next.config.js (with workarounds for styled-jsx)
├── tailwind.config.ts (with dark mode)
├── vercel.json (deployment config)
└── package.json
```

### Mobile Structure (`apps/mobile/`)

```
apps/mobile/
├── app/
│   ├── _layout.tsx (root layout with theme provider)
│   ├── index.tsx (redirect to tabs)
│   ├── login.tsx
│   ├── register.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx (tab navigation)
│   │   ├── index.tsx (collection screen)
│   │   ├── forums.tsx (NEW)
│   │   ├── species.tsx (NEW)
│   │   ├── community.tsx
│   │   └── profile.tsx
│   ├── tarantula/
│   │   ├── [id].tsx (detail screen)
│   │   ├── add.tsx
│   │   ├── edit.tsx
│   │   ├── add-feeding.tsx
│   │   ├── add-molt.tsx
│   │   └── add-photo.tsx
│   ├── analytics/
│   │   └── index.tsx
│   ├── species/
│   │   └── [id].tsx (NEW)
│   ├── forums/ (NEW)
│   │   ├── [category].tsx
│   │   ├── thread/[id].tsx
│   │   └── new-thread.tsx
│   ├── community/ (NEW)
│   │   ├── board.tsx
│   │   ├── [username].tsx
│   │   └── forums/
│   │       ├── [slug].tsx
│   │       └── [slug]/[threadId].tsx
│   ├── messages/ (NEW)
│   │   ├── index.tsx
│   │   └── [username].tsx
│   ├── settings.tsx (NEW)
│   ├── notifications.tsx (NEW - notification settings)
│   └── privacy.tsx (NEW)
├── src/
│   ├── components/
│   │   ├── FeedingStatsCard.tsx (with dark mode)
│   │   ├── GrowthChart.tsx
│   │   ├── PhotoViewer.tsx
│   │   ├── TarantulaDetailSkeleton.tsx
│   │   ├── TarantulaCardSkeleton.tsx
│   │   ├── CommunitySkeletons.tsx (NEW)
│   │   ├── Skeleton.tsx (NEW)
│   │   └── ActivityFeedItem.tsx (NEW)
│   ├── contexts/
│   │   ├── AuthContext.tsx
│   │   └── ThemeContext.tsx (light/dark theme provider)
│   └── services/
│       ├── api.ts (axios client with auth interceptors)
│       └── notifications.ts (NEW - local & push notification service)
├── assets/
│   ├── icon.png (app icon - dark background)
│   ├── adaptive-icon.png (Android adaptive icon - transparent)
│   └── (other images and icons)
├── app.json (Expo configuration with icon paths)
├── eas.json (EAS Build configuration)
└── package.json
```

---

## 🔧 Key Technical Details

### API Routes (All prefixed with `/api/v1`)

**Auth:**
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login (returns JWT token)
- `GET /auth/me` - Get current user info (requires auth)

**Tarantulas:**
- `GET /tarantulas/` - List user's tarantulas (requires auth)
- `POST /tarantulas/` - Create tarantula (requires auth)
- `GET /tarantulas/{id}` - Get single tarantula (requires auth)
- `PUT /tarantulas/{id}` - Update tarantula (requires auth)
- `DELETE /tarantulas/{id}` - Delete tarantula (requires auth)

**Species:**
- `GET /species/search?q={query}` - Search species (public, autocomplete)
- `GET /species/` - List all species (public, paginated)
- `GET /species/{id}` - Get species detail (public)
- `GET /species/by-name/{scientific_name}` - Get by name (public)
- `POST /species/` - Create species (requires auth, community submission)
- `PUT /species/{id}` - Update species (requires auth, submitter or admin only)
- `DELETE /species/{id}` - Delete species (admin only)

**Feeding Logs:**
- `GET /tarantulas/{id}/feedings` - List feeding logs
- `POST /tarantulas/{id}/feedings` - Create feeding log
- `PUT /feedings/{id}` - Update feeding log
- `DELETE /feedings/{id}` - Delete feeding log

**Molt Logs:**
- `GET /tarantulas/{id}/molts` - List molt logs
- `POST /tarantulas/{id}/molts` - Create molt log
- `PUT /molts/{id}` - Update molt log
- `DELETE /molts/{id}` - Delete molt log

**Substrate Changes:**
- `GET /tarantulas/{id}/substrate-changes` - List substrate changes
- `POST /tarantulas/{id}/substrate-changes` - Create substrate change (auto-updates tarantula)
- `PUT /substrate-changes/{id}` - Update substrate change
- `DELETE /substrate-changes/{id}` - Delete substrate change

**Photos:** (NEW)
- `GET /photos/{tarantula_id}` - List photos for tarantula
- `POST /photos/` - Upload photo (multipart/form-data)
- `DELETE /photos/{id}` - Delete photo

**Analytics:** (NEW)
- `GET /analytics/tarantulas/{id}/feeding-stats` - Comprehensive feeding analytics
- `GET /analytics/tarantulas/{id}/growth` - Growth analytics

**Breeding:** (NEW)
- `GET /pairings/` - List user's pairings
- `POST /pairings/` - Create pairing
- `GET /pairings/{id}` - Get pairing detail
- `PUT /pairings/{id}` - Update pairing
- `DELETE /pairings/{id}` - Delete pairing
- `GET /egg-sacs/` - List egg sacs
- `POST /egg-sacs/` - Create egg sac
- `PUT /egg-sacs/{id}` - Update egg sac
- `DELETE /egg-sacs/{id}` - Delete egg sac
- `GET /offspring/` - List offspring
- `POST /offspring/` - Create offspring record
- `PUT /offspring/{id}` - Update offspring
- `DELETE /offspring/{id}` - Delete offspring

**Community - Keepers:** (NEW)
- `GET /keepers/` - List public keepers
- `GET /keepers/{username}` - Get keeper profile
- `PUT /keepers/profile` - Update own profile

**Community - Forums:** (NEW)
- `GET /forums/threads` - List forum threads
- `POST /forums/threads` - Create thread
- `GET /forums/threads/{id}` - Get thread with replies
- `POST /forums/threads/{id}/reply` - Reply to thread
- `POST /forums/posts/{id}/like` - Like post
- `POST /forums/posts/{id}/react` - React to post

**Community - Follows:** (NEW)
- `POST /follows/{user_id}` - Follow user
- `DELETE /follows/{user_id}` - Unfollow user
- `GET /follows/followers` - Get followers
- `GET /follows/following` - Get following

**Community - Direct Messages:** (NEW)
- `GET /direct-messages/` - List conversations
- `GET /direct-messages/{username}` - Get conversation
- `POST /direct-messages/` - Send message

**Community - Activity:** (NEW)
- `GET /activity/feed` - Get activity feed
- `GET /activity/user/{user_id}` - Get user's activity

**Subscriptions:** (NEW)
- `GET /subscriptions/plans` - List subscription plans
- `POST /subscriptions/subscribe` - Subscribe to plan
- `GET /subscriptions/status` - Get subscription status

**Notifications:** (NEW)
- `GET /notification-preferences/` - Get user's notification preferences
- `PUT /notification-preferences/` - Update notification preferences
- `POST /notification-preferences/register-token` - Register Expo push token
- `GET /messages/direct/unread-count` - Get unread message count (for bell icon)

### Database Models

**Users Table:**
- `id` (UUID, PK)
- `email` (unique, indexed)
- `username` (unique, indexed)
- `hashed_password` (nullable for OAuth users)
- **OAuth fields**: `oauth_provider`, `oauth_id`, `oauth_access_token`, `oauth_refresh_token`
- Basic: `display_name`, `avatar_url`, `bio`
- **Community**: `profile_bio`, `profile_location`, `profile_experience_level`, `profile_years_keeping`, `profile_specialties` (array), `social_links` (JSONB), `collection_visibility`
- Flags: `is_breeder`, `is_active`, `is_superuser`, `is_admin`
- Timestamps: `created_at`, `updated_at`
- **Relationships**: `pairings`, `egg_sacs`, `offspring`

**Tarantulas Table:**
- `id` (UUID, PK)
- `user_id` (FK → users, CASCADE delete)
- `species_id` (FK → species, nullable)
- Basic: `name`, `common_name`, `scientific_name`, `sex`, `date_acquired`, `source`, `price_paid`, `notes`, `photo_url`
- **Husbandry**:
  - `enclosure_type` (ENUM: terrestrial/arboreal/fossorial)
  - `enclosure_size`
  - `substrate_type`, `substrate_depth`
  - `last_substrate_change`
  - `target_temp_min`, `target_temp_max`
  - `target_humidity_min`, `target_humidity_max`
  - `water_dish` (boolean, default true)
  - `misting_schedule`
  - `last_enclosure_cleaning`
  - `enclosure_notes`
- Flags: `is_public`
- Timestamps: `created_at`, `updated_at`
- **Relationships**: `photos`, `feeding_logs`, `molt_logs`, `substrate_changes`, `pairings_as_male`, `pairings_as_female`

**Species Table:**
- `id` (UUID, PK)
- `scientific_name` (unique, indexed)
- `scientific_name_lower` (unique, indexed - for case-insensitive search)
- `common_names` (ARRAY of strings)
- Taxonomy: `genus`, `family`
- Care: `care_level`, `temperament`, `native_region`, `adult_size`, `growth_rate`, `type`
- Climate: `temperature_min`, `temperature_max`, `humidity_min`, `humidity_max`
- Enclosure: `enclosure_size_sling`, `enclosure_size_juvenile`, `enclosure_size_adult`, `substrate_depth`, `substrate_type`
- Feeding: `prey_size`, `feeding_frequency_sling`, `feeding_frequency_juvenile`, `feeding_frequency_adult`
- Behavior: `water_dish_required`, `webbing_amount`, `burrowing`
- **Safety**: `urticating_hairs`, `medically_significant_venom`
- Documentation: `care_guide` (long text), `image_url`, `source_url`
- Community: `is_verified`, `submitted_by`, `community_rating`, `times_kept`
- Search: `searchable` (TSVECTOR for full-text search)
- Timestamps: `created_at`, `updated_at`

**Feeding Logs Table:**
- `id` (UUID, PK)
- `tarantula_id` (FK → tarantulas, CASCADE delete)
- `fed_at` (datetime with timezone)
- `food_type`, `food_size`
- `accepted` (boolean)
- `notes`
- `created_at`

**Molt Logs Table:**
- `id` (UUID, PK)
- `tarantula_id` (FK → tarantulas, CASCADE delete)
- `molted_at` (datetime with timezone)
- `premolt_started_at` (datetime, optional)
- `leg_span_before`, `leg_span_after` (numeric)
- `weight_before`, `weight_after` (numeric)
- `notes`, `image_url`
- `created_at`

**Substrate Changes Table:**
- `id` (UUID, PK)
- `tarantula_id` (FK → tarantulas, CASCADE delete)
- `changed_at` (date)
- `substrate_type`
- `substrate_depth`
- `reason` (e.g., "routine maintenance", "mold", "rehousing")
- `notes`
- `created_at`

**Photos Table:** (NEW)
- `id` (UUID, PK)
- `tarantula_id` (FK → tarantulas, CASCADE delete)
- `url`, `thumbnail_url`
- `caption`
- `taken_at` (datetime, optional)
- `created_at`

**Pairings Table:** (NEW)
- `id` (UUID, PK)
- `user_id` (FK → users, CASCADE delete)
- `male_id` (FK → tarantulas, CASCADE delete)
- `female_id` (FK → tarantulas, CASCADE delete)
- `paired_date`, `separated_date`
- `pairing_type` (ENUM: natural/assisted/forced)
- `outcome` (ENUM: successful/unsuccessful/in_progress/unknown)
- `notes`
- `created_at`
- **Relationships**: `egg_sacs`

**Egg Sacs Table:** (NEW)
- `id` (UUID, PK)
- `user_id` (FK → users, CASCADE delete)
- `pairing_id` (FK → pairings, CASCADE delete)
- Date fields, incubation conditions, hatch info
- **Relationships**: `offspring`

**Offspring Table:** (NEW)
- `id` (UUID, PK)
- `user_id` (FK → users, CASCADE delete)
- `egg_sac_id` (FK → egg_sacs, CASCADE delete)
- Status, sale info, tracking fields

**Activity Feed Table:** (NEW)
- `id` (UUID, PK)
- `user_id` (FK → users)
- `activity_type` (string)
- `target_id` (string - polymorphic)
- `data` (JSONB)
- `created_at`

**Follow Table:** (NEW)
- `follower_id` (FK → users)
- `following_id` (FK → users)
- `created_at`
- Composite PK on (follower_id, following_id)

**Direct Message Table:** (NEW)
- `id` (UUID, PK)
- `sender_id` (FK → users)
- `recipient_id` (FK → users)
- `message_text`
- `read` (boolean)
- `created_at`

**Forum/Message Tables:** (NEW)
- `messages` (threads)
- `message_replies`
- `message_likes`
- `message_reactions`

**Subscriptions Table:** (NEW)
- User subscription management
- Plan details, status, billing

**Notification Preferences Table:** (NEW)
- `id` (UUID, PK)
- `user_id` (FK → users, CASCADE delete, unique)
- **Local Notification Settings**:
  - `feeding_reminders_enabled`, `feeding_reminder_hours`
  - `substrate_reminders_enabled`, `substrate_reminder_days`
  - `molt_predictions_enabled`
  - `maintenance_reminders_enabled`, `maintenance_reminder_days`
- **Push Notification Settings**:
  - `push_notifications_enabled`
  - `direct_messages_enabled`
  - `forum_replies_enabled`
  - `new_followers_enabled`
  - `community_activity_enabled`
- **Quiet Hours**:
  - `quiet_hours_enabled`
  - `quiet_hours_start`, `quiet_hours_end`
- **Device**: `expo_push_token`
- Timestamps: `created_at`, `updated_at`

---

## 🐛 Known Issues & Fixes Applied

### Issue: 405 Method Not Allowed on POST /api/v1/tarantulas
**Cause**: Trailing slash mismatch. API routes registered as `/api/v1/tarantulas/` (with slash) but frontend calling `/api/v1/tarantulas` (without slash). FastAPI's `redirect_slashes=True` doesn't work properly with authentication headers.

**Fix**: Added trailing slashes to all frontend API calls:
- `/api/v1/tarantulas/` (GET, POST)
- Other routes with path params already worked (e.g., `/api/v1/tarantulas/{id}`)

**Files Modified**:
- `apps/web/src/app/dashboard/page.tsx` (GET tarantulas)
- `apps/web/src/app/dashboard/tarantulas/add/page.tsx` (POST tarantulas)

### Issue: Text not visible in forms and detail pages
**Cause**: Missing text color classes on paragraph elements, white text on white background.

**Fix**:
1. Global CSS for form elements: `apps/web/src/app/globals.css`
   ```css
   input, textarea, select {
     @apply text-gray-900 bg-white dark:bg-gray-100 dark:text-gray-900;
   }
   label {
     @apply text-gray-700 dark:text-gray-300;
   }
   ```
2. Added `text-gray-900 dark:text-white` to all data display paragraphs in detail pages

### Issue: Pydantic v2 compatibility
**Cause**: Using `.dict()` method which was deprecated in Pydantic v2.

**Fix**: Changed all instances to `.model_dump()` in:
- `apps/api/app/routers/tarantulas.py`
- `apps/api/app/routers/feedings.py`
- `apps/api/app/routers/molts.py`
- `apps/api/app/routers/substrate_changes.py`
- All other routers

### Issue: Bcrypt password hash error (longer than 72 bytes)
**Cause**: Bcrypt has a 72-character limit.

**Fix**: Truncate passwords to 72 chars before hashing in `apps/api/app/utils/auth.py`:
```python
def get_password_hash(password: str) -> str:
    truncated_password = password[:72]
    return pwd_context.hash(truncated_password)
```

### Issue: CORS preflight OPTIONS requests failing
**Cause**: Missing OPTIONS in allowed methods.

**Fix**: Added OPTIONS to CORS middleware in `main.py`:
```python
allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
```

---

## 🚀 Deployment & Environment

### Environment Variables (Render - API)

**Required:**
- `DATABASE_URL` - PostgreSQL connection string (Neon)
- `SECRET_KEY` - JWT secret key
- `CORS_ORIGINS` - Comma-separated list (Vercel domain)

**Optional:**
- `PORT` - Default 8000
- `CLOUDFLARE_R2_ACCESS_KEY_ID` - For photo uploads
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY` - For photo uploads
- `CLOUDFLARE_R2_BUCKET_NAME` - Photo storage bucket
- `CLOUDFLARE_R2_ENDPOINT` - R2 endpoint URL

### Render Configuration
- **Build Command**: (none needed)
- **Start Command**: `bash apps/api/start.sh`
- **Auto-deploy**: Enabled on push to main
- **Health Check**: GET `/` returns 200 OK

**start.sh does**:
1. `cd apps/api`
2. `alembic upgrade head` (runs pending migrations)
3. `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`

### Vercel Configuration (Web)
- Auto-deploys on push to main
- Next.js 14 app with React 19
- **Environment Variables**:
  - `NEXT_PUBLIC_API_URL` = https://tarantuverse-api.onrender.com
- **Build Workarounds**:
  - `vercel.json` with custom configuration
  - `next.config.js` with styled-jsx workarounds
  - Static error pages (404.html, 500.html)

### Expo/EAS Configuration (Mobile)
- Development: Expo Go
- Production: EAS Build
- **Configuration**: `eas.json`
- **Environment**: API URL configured in app.json

---

## 🎯 Roadmap & Next Steps

### Phase 1 - Core Features (✅ COMPLETED)
1. ✅ Basic collection management (CRUD)
2. ✅ Feeding/molt/substrate tracking
3. ✅ Species database and care sheets
4. ✅ User authentication (traditional + OAuth)
5. ✅ Photo management with cloud storage
6. ✅ Analytics and statistics
7. ✅ Dark mode (web + mobile)
8. ✅ Mobile app with feature parity

### Phase 2 - Community & Social (✅ COMPLETED)
1. ✅ Keeper profiles with experience levels
2. ✅ Follow system
3. ✅ Activity feed
4. ✅ Direct messaging
5. ✅ Forums system with categories
6. ✅ Community board
7. ✅ Public collections

### Phase 3 - Breeding Module (✅ COMPLETED)
1. ✅ Pairing logs and tracking
2. ✅ Egg sac monitoring
3. ✅ Offspring management
4. ✅ Breeding tab on tarantula details
5. ✅ Activity feed integration

### Phase 4 - Premium & Monetization (In Progress)
1. ✅ Backend infrastructure complete
2. ✅ Pricing page created
3. 🚧 Payment integration (Stripe/PayPal)
4. 🚧 Premium feature gating
5. 🚧 Subscription management dashboard

### Phase 5 - Advanced Features (Future)

**Health Tracking:**
- Medical logs
- Injury tracking
- DKS (dyskinetic syndrome) monitoring
- Treatment records
- Vet visit logs

**Smart Insights & ML:**
- Feeding cost calculator
- Premolt predictor (ML based on feeding refusals + time since last molt)
- Growth predictions
- Feeding refusal pattern analysis
- Collection value estimator
- Personality profiles (temperament over time)

**IoT Integration:**
- Environmental monitoring (temp/humidity sensors)
- Alerts for out-of-range conditions
- Automated logging
- Smart enclosure controls

**Advanced Breeding:**
- Lineage tracking and visualization
- Inbreeding coefficient calculator
- Morph calculator (for color morphs)
- Breeding project planner

**Enhanced Mobile:**
- Push notifications
- Offline mode with sync
- QR code scanning for enclosure labels
- NFC tag support
- Widget support

**Marketplace:**
- Integrated breeder marketplace
- Classified ads
- Collection insurance value tracker
- Expo wishlist tracker
- MorphMarket integration

**Gamification:**
- Keeper experience system (levels, badges)
- Collection achievements
- Community challenges
- Leaderboards

---

## 📝 Important Notes for Future Development

### Code Standards

1. **Always use trailing slashes** for collection endpoints in frontend API calls:
   - ✅ `/api/v1/tarantulas/`
   - ❌ `/api/v1/tarantulas`

2. **Pydantic v2**: Use `.model_dump()` instead of `.dict()`

3. **Database changes**: Always create Alembic migrations
   - Run `alembic revision -m "description"` (in Render shell or manually create file)
   - Follow naming: `{hash}_{snake_case_description}.py`
   - Set `down_revision` to previous migration hash
   - Test both `upgrade()` and `downgrade()`

4. **Text visibility**: Always add explicit color classes with dark mode support:
   - Data display: `text-gray-900 dark:text-white`
   - Labels: `text-gray-700 dark:text-gray-300`
   - Muted text: `text-gray-500 dark:text-gray-400`

5. **Form inputs**: Use global styles but add dark mode variants:
   - `text-gray-900 bg-white dark:bg-gray-800 dark:text-white`

6. **⚠️ CRITICAL - Dark Mode Conformance**: ALL new features, pages, and components MUST support both light and dark modes
   - **Web**: Use Tailwind `dark:` modifiers on ALL styled elements
     - Backgrounds: `bg-white dark:bg-gray-800`
     - Text: `text-gray-900 dark:text-white`
     - Borders: `border-gray-200 dark:border-gray-700`
     - Buttons, cards, inputs, modals - everything needs dark variants
   - **Mobile**: Use ThemeContext colors for ALL styled elements
     - Use `theme.background`, `theme.surface`, `theme.text`, etc.
     - Never use hardcoded colors like `#FFFFFF` or `black`
   - **Testing**: Test BOTH themes before considering a feature complete
   - **No Exceptions**: Even small UI tweaks must maintain dark mode support

7. **React 19**: Project uses React 19.1.0 with overrides in root package.json

### API Route Patterns

```python
# Collection endpoints (authenticated)
@router.get("/", response_model=List[ResponseSchema])
async def get_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ...

# Create endpoints
@router.post("/", response_model=ResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_item(
    item_data: CreateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_item = Model(
        user_id=current_user.id,  # or tarantula_id for logs
        **item_data.model_dump()
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

# Update/Delete: Always verify ownership through user_id or tarantula.user_id
```

### Frontend Patterns

```typescript
// Fetch with auth
const response = await fetch(`${API_URL}/api/v1/endpoint/`, {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
})

// POST with auth and body
const response = await fetch(`${API_URL}/api/v1/endpoint/`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify(data),
})

// Always check response.ok before parsing JSON
if (!response.ok) {
  throw new Error('Failed to ...')
}
const data = await response.json()
```

---

## 🔍 Database Migration Status

### Complete Migration Chain (15 migrations):
1. `9588b399ad54_initial_migration.py` - Initial schema
2. `a1b2c3d4e5f6_add_photo_url_to_tarantulas.py` - Photo URL field
3. `b2c3d4e5f6g7_expand_species_model.py` - Expanded species fields
4. `c3d4e5f6g7h8_add_husbandry_and_substrate_changes.py` - Husbandry + substrate changes
5. `d1e2f3g4h5i6_add_community_features.py` - Community base
6. `e2f3g4h5i6j7_add_messages_table.py` - Message board
7. `f3g4h5i6j7k8_add_message_interactions.py` - Likes/reactions
8. `g4h5i6j7k8l9_add_follow_and_direct_messaging_models.py` - Follow + DM
9. `h5i6j7k8l9m0_add_forums_and_activity_feed.py` - Forums + activity
10. `i6j7k8l9m0n1_change_activity_target_id_to_string.py` - Activity target fix
11. `j1k2l3m4n5o6_add_subscription_tables.py` - Subscriptions
12. `add_oauth_fields.py` (oauth_fields_001) - OAuth authentication
13. `add_safety_fields_to_species.py` - Safety information
14. `k2l3m4n5o6p7_add_breeding_module.py` - Breeding module
15. `l3m4n5o6p7q8_add_notification_preferences.py` - Notification system

**All migrations applied to production database**

---

## 🎨 Design System

### Colors
- **Primary**: `#8B4513` (brown/earth tones for tarantulas)
- **Text**:
  - Light mode: `gray-900` (nearly black)
  - Dark mode: `white` or `gray-100`
- **Labels**:
  - Light mode: `gray-700` (medium gray)
  - Dark mode: `gray-300`
- **Muted**:
  - Light mode: `gray-500` or `gray-600`
  - Dark mode: `gray-400`
- **Backgrounds**:
  - Light mode: `white`, `gray-50`
  - Dark mode: `gray-900`, `gray-800`
- **Success**: `green-100` (bg), `green-800` (text)
- **Error**: `red-100` (bg), `red-700` (text)
- **Info**: `blue-600` (buttons)
- **Warning**: `yellow-100` (bg), `yellow-800` (text)

### Typography
- Headings: Bold, varying sizes (4xl, 2xl, xl, lg)
- Body: Base size (text-sm, text-base, text-lg)
- Monospace font rendering (Next.js default)

### Components
- **Cards**: `border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-lg transition bg-white dark:bg-gray-800`
- **Buttons**: `px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition`
- **Forms**:
  - Inputs: `w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 dark:text-white bg-white dark:bg-gray-800`
  - Labels: `block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300`

---

## 💡 Tips for Continuing Development

### ⚠️ CRITICAL: Web & Mobile Feature Parity

**IMPORTANT**: When adding a new feature to the web app, it **MUST** also be added to the mobile app to maintain feature parity.

This includes:
- New log types (feeding, molt, substrate changes, etc.)
- New pages or screens
- New functionality on existing pages
- Analytics and statistics features
- UI improvements and components
- Dark mode support for all new components
- Community features

**Exception**: Features that are web-specific (like certain admin panels) or mobile-specific (like camera integration) are the only exclusions.

### When Adding New Log Types:
1. Create model in `models/`
2. Create schema in `schemas/` (Base, Create, Update, Response)
3. Create router in `routers/` with CRUD endpoints
4. Add router to `main.py` imports and `include_router()`
5. Create migration with proper `down_revision`
6. **WEB**: Add interface to frontend detail page
7. **WEB**: Add state and fetch function
8. **WEB**: Create inline form (similar to feeding/molt forms)
9. **WEB**: Display logs in list with delete buttons
10. **WEB**: Ensure dark mode support
11. **MOBILE**: Add interface to mobile detail screen
12. **MOBILE**: Add state and fetch function
13. **MOBILE**: Create form screen or inline form
14. **MOBILE**: Display logs in list with delete buttons
15. **MOBILE**: Ensure dark mode support with ThemeContext

### When Adding New Fields to Existing Models:
1. Update model in `models/`
2. Update schema in `schemas/` (add to Base class)
3. Create migration with `op.add_column()`
4. Update frontend interface (TypeScript types)
5. Update frontend forms (add/edit pages)
6. Update detail page display
7. Update mobile screens
8. Test on both platforms
9. Test both light and dark modes

### Testing Checklist:
**Functionality:**
- [ ] Registration works
- [ ] Login works (traditional + OAuth if implemented)
- [ ] Add tarantula (with trailing slash!)
- [ ] View tarantula detail
- [ ] Edit tarantula
- [ ] Delete tarantula
- [ ] Add feeding log
- [ ] Add molt log
- [ ] Add substrate change log
- [ ] Upload photos (mobile + web)
- [ ] Species autocomplete works
- [ ] View Care Sheet button appears and works
- [ ] Husbandry section displays when data exists
- [ ] Breeding module (pairings, egg sacs, offspring)
- [ ] Community features (forums, DMs, follows)
- [ ] Analytics displays correctly

**UI/UX:**
- [ ] Test on web (desktop + mobile viewport)
- [ ] Test on mobile app (iOS + Android)
- [ ] Test light mode on all screens
- [ ] Test dark mode on all screens
- [ ] Verify theme toggle works
- [ ] Check responsive layouts
- [ ] Test navigation (sidebar, tabs)

---

## 📞 Important Contacts & Resources

- **Arachnoboards**: https://arachnoboards.com - Community forum for keeper feedback
- **Species Data Source**: Obsidian vault at `C:\Users\gwiza\Documents\Obscuravault`
- **API Documentation**: https://tarantuverse-api.onrender.com/docs (FastAPI auto-generated)
- **GitHub Repo**: (add your repo URL here)

---

## 🎓 Learning from This Project

### Key Architectural Decisions:
1. **Monorepo with pnpm workspaces**: Allows shared types/configs between web, mobile, and API
2. **FastAPI + SQLAlchemy 2.0**: Fast, type-safe Python backend with async support
3. **PostgreSQL with advanced features**: Array types, JSONB, full-text search (TSVECTOR)
4. **JWT Authentication + OAuth**: Stateless, scalable auth with social login support
5. **Pydantic v2 for validation**: Type safety and automatic API documentation
6. **Next.js 14 with React 19**: Modern React framework with latest features
7. **React Native + Expo**: Cross-platform mobile with single codebase
8. **Tailwind CSS + next-themes**: Utility-first styling with built-in dark mode
9. **Cloudflare R2**: Cost-effective S3-compatible object storage

### What Makes This Special:
- **Niche focus**: Tarantula/invertebrate keepers are underserved by existing apps
- **Comprehensive tracking**: Goes beyond basic feeding/molt logs to include substrate, husbandry, breeding
- **Species integration**: Link individual animals to comprehensive care sheets
- **Community-first**: Built-in social features from day one
- **Data-driven**: Track everything to enable future analytics/ML features
- **Cross-platform**: True feature parity between web and mobile
- **Modern UX**: Dark mode, modern navigation patterns, professional design

### Technical Achievements:
- Successfully implemented OAuth alongside traditional auth
- Built complex many-to-many relationships (follows, breeding lineage)
- Integrated photo storage with automatic thumbnail generation
- Real-time activity feed with polymorphic relationships
- Comprehensive analytics with charting
- Full dark mode implementation across entire stack
- Modern persistent sidebar navigation (2025 best practices)

---

## 🚧 Current Limitations & Future Work

### Current Limitations:
- No offline mode (requires internet connection)
- No email notifications (only push notifications implemented)
- No environmental sensor integration (IoT)
- Payment integration not complete
- No export functionality (CSV, PDF)

### Immediate TODOs:
1. Complete payment integration (Stripe/PayPal)
2. Implement email notifications for feeding reminders
3. Implement data export (CSV, PDF)
4. Add bulk operations (bulk feeding logs, etc.)
5. Implement search functionality across platform
6. Complete OAuth provider setup (Google, Apple, GitHub)
7. Add WebSocket for real-time updates

### Future Enhancements:
- Offline mode with local storage and sync
- Email/SMS notifications (feeding reminders, molt predictions)
- Temperature/humidity sensor integration (IoT)
- QR code labels for enclosures
- Multi-user collections (shared access)
- Marketplace/classifieds integration
- ML-based premolt predictor
- Feeding cost calculator
- Collection insurance value tracker
- Expo wishlist tracker
- Video uploads
- Tarantula "personality profiles"
- Breeder network and marketplace

---

**Last Updated**: 2025-11-22
**Version**: 0.9.0 (Notifications, Admin Tools & Branding Complete)
**Status**: Active Development

**Recent Changes** (2025-11-22):
- 🔔 **NOTIFICATION SYSTEM COMPLETE**: Comprehensive notification infrastructure
  - Local notifications (mobile): Feeding reminders, substrate reminders, molt predictions, maintenance
  - Push notifications: Direct messages, forum replies, new followers, community activity
  - Web notification settings page with full configuration UI
  - Functional notification bell icon with unread message count (auto-refreshing)
  - Expo Push Notification Service integration via httpx
  - Database migration for `notification_preferences` table
  - Complete mobile notification settings screen

- 👨‍💼 **ADMIN TOOLS**: Species management interface
  - `/dashboard/admin/species/manage` - Complete CRUD interface
  - Searchable species table with inline editing
  - Verification status toggle
  - Delete functionality with confirmation
  - Admin-only access control

- 🎨 **PROFESSIONAL BRANDING**: Logo implementation
  - Purple-to-pink gradient tarantula silhouette
  - Web: Sidebar logo, favicon, landing page
  - Mobile: App icon and adaptive icon for Android
  - Replaced spider emoji throughout platform

- 📚 **DOCUMENTATION REORGANIZATION**: Clean project structure
  - Organized 60+ markdown files into `/docs/archive`, `/docs/setup`, `/docs/planning`
  - Root directory cleaned to 4 essential files
  - Complete git history preserved with `git mv`

**Changes from 2025-11-10**:
- 📝 **DOCUMENTATION OVERHAUL**: Complete CLAUDE.md update
  - Added all missing features (community, breeding, photos, OAuth, safety)
  - Documented 14 migrations (was only showing 3)
  - Added all new API routes and models
  - Updated tech stack (React 19)
  - Moved completed features out of "Future" roadmap
  - Comprehensive file structure documentation

**Changes from 2025-10-28**:
- ✅ **BREEDING MODULE COMPLETE**: Full breeding tracking system
- ✅ **NAVIGATION REWRITE**: Modern persistent sidebar navigation
- ✅ **SAFETY INFORMATION**: urticating_hairs and medically_significant_venom fields
- ✅ Fixed build errors and TypeScript issues
