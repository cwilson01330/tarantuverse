# Tarantuverse - Project Plan & Architecture

## 🎯 Project Overview

**Tarantuverse** is a cross-platform (web + mobile) tarantula husbandry tracking application designed for both hobbyists and breeders. It addresses critical pain points in existing apps while adding community and breeding features.

## 🚀 Core Value Propositions

1. **Bulletproof Data Reliability** - No more data loss nightmares
2. **Comprehensive Breeding Tools** - Full lifecycle tracking from pairing to offspring
3. **Community Integration** - Share, learn, and connect with other keepers
4. **Growing Knowledge Base** - Curated care guides and species information
5. **Beautiful Analytics** - Visualize growth, feeding patterns, and collection stats

---

## 📋 Feature Roadmap

### Phase 1: MVP (Months 1-3)
**Core Tracking Features**
- [ ] User authentication & profiles
- [ ] Add/edit/delete tarantula records
- [ ] Species database (searchable, filterable)
- [ ] Feeding logs with reminders
- [ ] Molt tracking & history
- [ ] Photo gallery per tarantula
- [ ] Basic care notes
- [ ] Cloud sync & backup
- [ ] Export data (JSON/CSV)

### Phase 2: Breeding & Analytics (Months 4-5)
**Breeder Tools**
- [ ] Pairing logs (male + female tracking)
- [ ] Egg sac management
- [ ] Offspring tracking & batch management
- [ ] Lineage/pedigree view
- [ ] Breeding project organization

**Analytics Dashboard**
- [ ] Growth charts (weight, size over time)
- [ ] Feeding pattern analysis
- [ ] Molt cycle predictions
- [ ] Collection statistics
- [ ] Cost tracking (optional)

### Phase 3: Community & Social (Months 6-7)
**Community Features**
- [ ] Public collection profiles
- [ ] Breeding project showcases
- [ ] Species discussion forums
- [ ] Photo sharing & galleries
- [ ] Follow/friend system
- [ ] Private messaging
- [ ] Marketplace integration (listings, not transactions)

### Phase 4: Advanced Features (Months 8+)
- [ ] Advanced care reminders (rehousing, substrate changes)
- [ ] Multi-user collections (share access)
- [ ] QR code labels for enclosures
- [ ] Bulk import/export
- [ ] Integration with breeder websites
- [ ] Temperature/humidity logging
- [ ] Veterinary records

---

## 🏗️ Technical Architecture

### System Overview
```
┌─────────────┐      ┌─────────────┐
│   Web App   │      │  Mobile App │
│  (Next.js)  │      │(React Native)│
└──────┬──────┘      └──────┬──────┘
       │                    │
       └────────┬───────────┘
                │
         ┌──────▼──────┐
         │   REST API  │
         │  (FastAPI)  │
         └──────┬──────┘
                │
       ┌────────┴────────┐
       │                 │
  ┌────▼────┐      ┌────▼────┐
  │PostgreSQL│      │ Firebase│
  │(Main DB) │      │  (Auth) │
  └─────────┘      └─────────┘
       │
  ┌────▼────┐
  │S3/R2    │
  │(Images) │
  └─────────┘
```

### Tech Stack

#### **Frontend**
- **Web**: Next.js 14+ (App Router), React 18, TypeScript
  - Styling: Tailwind CSS + shadcn/ui
  - State: Zustand or Redux Toolkit
  - Forms: React Hook Form + Zod validation

- **Mobile**: React Native (Expo)
  - Navigation: Expo Router
  - UI: React Native Paper or NativeBase
  - Shared business logic with web via npm workspace

#### **Backend**
- **API**: Python FastAPI
  - Async/await for performance
  - Pydantic models for validation
  - SQLAlchemy 2.0 ORM
  - Alembic for migrations

- **Authentication**: Firebase Auth or Supabase Auth
  - Social logins (Google, Apple)
  - Email/password
  - JWT tokens

- **Database**: PostgreSQL 15+
  - Row-level security
  - Full-text search for species
  - JSONB for flexible metadata

- **File Storage**: Cloudflare R2 or AWS S3
  - Image compression/optimization
  - CDN delivery

- **Real-time**: WebSockets (FastAPI) or Supabase Realtime
  - Live notifications
  - Collaborative features

#### **Infrastructure**
- **Hosting**:
  - Backend: Railway, Render, or DigitalOcean
  - Web: Vercel
  - Mobile: Expo EAS

- **Monitoring**: Sentry (errors) + PostHog (analytics)

- **CI/CD**: GitHub Actions

---

## 📂 Project Structure

```
tarantuverse/
├── apps/
│   ├── web/                 # Next.js web app
│   │   ├── src/
│   │   │   ├── app/        # App router pages
│   │   │   ├── components/ # React components
│   │   │   ├── lib/        # Utilities & API client
│   │   │   └── stores/     # State management
│   │   ├── public/
│   │   └── package.json
│   │
│   ├── mobile/             # React Native app
│   │   ├── src/
│   │   │   ├── screens/
│   │   │   ├── components/
│   │   │   ├── navigation/
│   │   │   └── services/
│   │   ├── app.json
│   │   └── package.json
│   │
│   └── api/                # FastAPI backend
│       ├── app/
│       │   ├── main.py
│       │   ├── models/     # SQLAlchemy models
│       │   ├── schemas/    # Pydantic schemas
│       │   ├── routers/    # API endpoints
│       │   ├── services/   # Business logic
│       │   └── utils/
│       ├── alembic/        # DB migrations
│       ├── tests/
│       └── requirements.txt
│
├── packages/
│   └── shared/             # Shared TypeScript types & utils
│       ├── src/
│       │   ├── types/
│       │   └── constants/
│       └── package.json
│
├── docs/
│   ├── api/                # API documentation
│   ├── architecture/       # System diagrams
│   └── user-guides/
│
├── scripts/                # Dev tools & utilities
├── .github/                # CI/CD workflows
├── docker-compose.yml      # Local development
├── package.json            # Root workspace config
└── README.md
```

---

## 🗄️ Database Schema (Core Tables)

### Users
```sql
users
├── id (uuid, PK)
├── email (unique)
├── username (unique)
├── display_name
├── avatar_url
├── bio
├── is_breeder (boolean)
├── created_at
└── updated_at
```

### Tarantulas
```sql
tarantulas
├── id (uuid, PK)
├── user_id (FK -> users)
├── species_id (FK -> species)
├── common_name
├── scientific_name
├── sex (male/female/unknown)
├── date_acquired
├── source (bred/bought/wild-caught)
├── price_paid
├── enclosure_size
├── substrate_type
├── is_public (boolean)
├── notes (text)
├── created_at
└── updated_at
```

### Species
```sql
species
├── id (uuid, PK)
├── scientific_name (unique)
├── common_names (text[])
├── genus
├── care_level (beginner/intermediate/advanced)
├── temperament
├── native_region
├── adult_size
├── growth_rate
├── care_guide (text, markdown)
├── image_url
└── searchable (tsvector for full-text search)
```

### Feeding Logs
```sql
feeding_logs
├── id (uuid, PK)
├── tarantula_id (FK)
├── fed_at (timestamp)
├── food_type
├── food_size
├── accepted (boolean)
├── notes
└── created_at
```

### Molt Logs
```sql
molt_logs
├── id (uuid, PK)
├── tarantula_id (FK)
├── molted_at (timestamp)
├── premolt_started_at
├── leg_span_before
├── leg_span_after
├── weight_before
├── weight_after
├── notes
├── image_url
└── created_at
```

### Pairings (Breeding)
```sql
pairings
├── id (uuid, PK)
├── user_id (FK)
├── male_id (FK -> tarantulas)
├── female_id (FK -> tarantulas)
├── paired_at (timestamp)
├── successful (boolean)
├── notes
└── created_at
```

### Egg Sacs
```sql
egg_sacs
├── id (uuid, PK)
├── pairing_id (FK)
├── laid_at (timestamp)
├── pulled_at (timestamp)
├── hatch_date (estimated)
├── count_estimate
├── status (incubating/hatched/failed)
├── notes
└── created_at
```

### Offspring
```sql
offspring
├── id (uuid, PK)
├── egg_sac_id (FK)
├── tarantula_id (FK, nullable - if kept)
├── sold_at (timestamp)
├── buyer_info
├── price
└── created_at
```

### Photos
```sql
photos
├── id (uuid, PK)
├── tarantula_id (FK)
├── url
├── thumbnail_url
├── caption
├── taken_at (timestamp)
└── created_at
```

### Community (Phase 3)
```sql
posts
├── id (uuid, PK)
├── user_id (FK)
├── tarantula_id (FK, nullable)
├── content (text)
├── image_urls (text[])
├── likes_count
└── created_at

comments
├── id (uuid, PK)
├── post_id (FK)
├── user_id (FK)
├── content (text)
└── created_at
```

---

## 🔌 API Endpoints (v1)

### Authentication
```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
```

### Tarantulas
```
GET    /api/v1/tarantulas              # List user's tarantulas
POST   /api/v1/tarantulas              # Create new
GET    /api/v1/tarantulas/:id          # Get single
PUT    /api/v1/tarantulas/:id          # Update
DELETE /api/v1/tarantulas/:id          # Delete
GET    /api/v1/tarantulas/:id/stats    # Growth charts, analytics
```

### Species
```
GET    /api/v1/species                 # Search & filter
GET    /api/v1/species/:id             # Get single with care guide
POST   /api/v1/species                 # Admin: add new
```

### Feeding
```
GET    /api/v1/tarantulas/:id/feedings
POST   /api/v1/tarantulas/:id/feedings
PUT    /api/v1/feedings/:id
DELETE /api/v1/feedings/:id
```

### Molts
```
GET    /api/v1/tarantulas/:id/molts
POST   /api/v1/tarantulas/:id/molts
PUT    /api/v1/molts/:id
DELETE /api/v1/molts/:id
```

### Breeding
```
POST   /api/v1/pairings
GET    /api/v1/pairings
GET    /api/v1/pairings/:id
POST   /api/v1/pairings/:id/egg-sac
GET    /api/v1/egg-sacs/:id
POST   /api/v1/egg-sacs/:id/offspring
```

### Photos
```
POST   /api/v1/tarantulas/:id/photos   # Upload
GET    /api/v1/tarantulas/:id/photos
DELETE /api/v1/photos/:id
```

### Community (Phase 3)
```
GET    /api/v1/users/:username/collection  # Public profile
GET    /api/v1/feed                         # Activity feed
POST   /api/v1/posts
GET    /api/v1/posts/:id
```

---

## 🎨 UI/UX Design Principles

### Visual Design
- **Modern & Clean**: Card-based layouts, generous whitespace
- **Photography-First**: Large, beautiful tarantula photos
- **Dark Mode**: Essential for spider lovers viewing at night
- **Responsive**: Seamless experience across all devices

### User Experience
- **Quick Add**: Add feeding/molt in <30 seconds
- **Smart Defaults**: Learn user preferences, pre-fill forms
- **Offline-First**: Core features work without internet
- **Progressive Disclosure**: Advanced features don't clutter basic UI
- **Onboarding**: Interactive tutorial for new users

### Key Screens

#### Mobile App
1. **Dashboard/Home**: Collection overview, recent activity, reminders
2. **Collection Grid**: Photo cards of all tarantulas
3. **Tarantula Detail**: Photos, logs, stats, care info
4. **Quick Log**: Fast feeding/molt entry
5. **Species Explorer**: Browse, search, wishlist
6. **Profile**: Settings, data export, community

#### Web App
- Similar screens but optimized for desktop
- Advanced analytics dashboards
- Bulk editing tools
- Better data visualization

---

## 🔐 Security & Privacy

- **Data Encryption**: At rest (database) and in transit (HTTPS/TLS)
- **Privacy Controls**:
  - Collections can be private, friends-only, or public
  - Granular sharing permissions
- **Data Ownership**: Users can export ALL data anytime
- **Automatic Backups**: Daily snapshots, 30-day retention
- **GDPR Compliant**: Right to deletion, data portability

---

## 📊 Analytics & Monitoring

### User Analytics (Privacy-Friendly)
- Feature usage patterns
- Crash reports
- Performance metrics
- No personal data tracking

### Business Metrics
- MAU/DAU
- Retention rates
- Feature adoption
- API performance

---

## 💰 Monetization Strategy (Optional - Phase 4+)

### Freemium Model
**Free Tier:**
- Up to 10 tarantulas
- Basic tracking & logs
- Species database access
- Community features

**Pro Tier ($4.99/month or $49/year):**
- Unlimited tarantulas
- Advanced analytics
- Breeding tools
- Priority support
- Ad-free
- Custom fields
- API access

**Breeder Tier ($19.99/month):**
- Everything in Pro
- Marketplace listings
- Multi-user collections
- Custom branding
- Bulk tools

---

## 🚦 Development Phases & Timeline

### Phase 1: Foundation (Weeks 1-4)
- Set up monorepo structure
- Initialize Next.js, React Native, FastAPI
- Database schema & migrations
- Basic authentication
- CI/CD pipelines

### Phase 2: Core MVP (Weeks 5-10)
- Tarantula CRUD operations
- Feeding & molt tracking
- Photo uploads
- Species database
- Mobile & web UI parity

### Phase 3: Breeding Tools (Weeks 11-14)
- Pairing logs
- Egg sac tracking
- Offspring management
- Analytics dashboard

### Phase 4: Community (Weeks 15-18)
- Public profiles
- Posts & comments
- Following system
- Notifications

### Phase 5: Polish & Launch (Weeks 19-20)
- Beta testing
- Bug fixes
- Performance optimization
- Marketing site
- App store submissions

---

## 🧪 Testing Strategy

- **Unit Tests**: Backend services, utility functions
- **Integration Tests**: API endpoints
- **E2E Tests**: Critical user flows (Playwright/Detox)
- **Manual Testing**: UI/UX on real devices
- **Beta Program**: 50-100 real users before public launch

---

## 📱 Launch Checklist

- [ ] iOS App Store submission
- [ ] Google Play Store submission
- [ ] Web app deployed (tarantuverse.com)
- [ ] API documentation live
- [ ] Privacy policy & terms of service
- [ ] Support email/system
- [ ] Social media presence
- [ ] Community forum (discourse/reddit)
- [ ] Initial species database populated (100+ species)
- [ ] Obsidian knowledge base imported

---

## 🎯 Success Metrics

### Year 1 Goals
- **1,000 active users**
- **10,000+ tarantulas tracked**
- **100+ breeding projects logged**
- **4.5+ star rating** on app stores
- **<1% data loss incidents** (vs 10%+ reported in competitors)
- **50%+ 30-day retention**

---

## 📚 Resources & Next Steps

### Immediate Next Steps
1. Initialize monorepo with pnpm/npm workspaces
2. Set up FastAPI boilerplate
3. Create Next.js app with TypeScript
4. Initialize Expo React Native app
5. Set up PostgreSQL + migrations
6. Implement authentication

### Learning Resources
- FastAPI: https://fastapi.tiangolo.com/
- Next.js: https://nextjs.org/docs
- Expo: https://docs.expo.dev/
- React Native: https://reactnative.dev/
- Supabase: https://supabase.com/docs (if chosen for auth/realtime)

---

## 🤝 Contribution Guidelines (Future)

When ready to open-source or accept contributions:
- Code style guides
- PR templates
- Issue templates
- Community code of conduct

---

**Last Updated**: October 5, 2025
**Version**: 1.0.0
