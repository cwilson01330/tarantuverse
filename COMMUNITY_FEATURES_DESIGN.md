# Community Features - Design Document

## Overview
Enable users to make their collections public, view other keepers' profiles, and build a community around tarantula husbandry.

---

## Database Schema Changes

### 1. Update `users` Table
Add fields for public profiles and community features:

```sql
ALTER TABLE users ADD COLUMN is_public BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN profile_bio TEXT;
ALTER TABLE users ADD COLUMN profile_location VARCHAR(255);
ALTER TABLE users ADD COLUMN profile_experience_level VARCHAR(50); -- beginner, intermediate, advanced, expert
ALTER TABLE users ADD COLUMN profile_years_keeping INTEGER;
ALTER TABLE users ADD COLUMN profile_specialties TEXT[]; -- e.g., ['arboreal', 'old_world', 'breeding']
ALTER TABLE users ADD COLUMN social_links JSONB; -- {instagram: '', youtube: '', website: ''}
ALTER TABLE users ADD COLUMN join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN collection_visibility VARCHAR(20) DEFAULT 'private'; -- private, public, followers_only
```

### 2. Update `tarantulas` Table
Add per-tarantula visibility control:

```sql
ALTER TABLE tarantulas ADD COLUMN visibility VARCHAR(20) DEFAULT 'private'; -- private, public
-- Note: Tarantula visibility should respect user's collection_visibility setting
-- If user is private, all tarantulas are private regardless of this field
```

### 3. New `follows` Table (Optional - for future)
Track who follows whom:

```sql
CREATE TABLE follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, following_id),
    CHECK (follower_id != following_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
```

### 4. New `collection_views` Table (Optional - analytics)
Track profile/collection views:

```sql
CREATE TABLE collection_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewer_id UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL if anonymous
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_collection_views_user ON collection_views(user_id);
CREATE INDEX idx_collection_views_date ON collection_views(viewed_at);
```

---

## API Endpoints

### User Profile Endpoints

#### Get Public User Profile
```
GET /api/v1/users/{user_id}/profile
```
Returns public profile info and collection (if public)
- No auth required for public profiles
- Returns 403 if profile is private

Response:
```json
{
  "id": "uuid",
  "username": "string",
  "display_name": "string",
  "avatar_url": "string",
  "profile_bio": "string",
  "profile_location": "string",
  "profile_experience_level": "intermediate",
  "profile_years_keeping": 5,
  "profile_specialties": ["arboreal", "new_world"],
  "social_links": {
    "instagram": "https://...",
    "youtube": "https://..."
  },
  "join_date": "2024-01-01T00:00:00Z",
  "collection_count": 15,
  "collection": [
    {
      "id": "uuid",
      "common_name": "Chilean Rose Hair",
      "scientific_name": "Grammostola rosea",
      "photo_url": "https://...",
      "sex": "female",
      "date_acquired": "2023-05-15"
    }
  ]
}
```

#### Update Own Profile Settings
```
PUT /api/v1/users/me/profile
```
Auth required. Update profile info and privacy settings.

Request:
```json
{
  "display_name": "string",
  "profile_bio": "string",
  "profile_location": "string",
  "profile_experience_level": "intermediate",
  "profile_years_keeping": 5,
  "profile_specialties": ["arboreal"],
  "social_links": {...},
  "collection_visibility": "public"
}
```

#### Toggle Collection Visibility
```
PATCH /api/v1/users/me/visibility
```
Auth required. Quick toggle for privacy.

Request:
```json
{
  "collection_visibility": "public" // or "private"
}
```

### Collection Discovery Endpoints

#### Browse Public Collections
```
GET /api/v1/collections?page=1&limit=20&sort=recent
```
No auth required. Returns list of public user profiles.

Query params:
- `page`: pagination
- `limit`: results per page (max 50)
- `sort`: `recent` (newest first), `collection_size` (most tarantulas), `popular` (most views)
- `experience_level`: filter by keeper experience
- `specialties`: filter by specialties (arboreal, fossorial, etc.)

Response:
```json
{
  "total": 150,
  "page": 1,
  "pages": 8,
  "results": [
    {
      "id": "uuid",
      "username": "string",
      "display_name": "string",
      "avatar_url": "string",
      "profile_bio": "string",
      "collection_count": 15,
      "profile_experience_level": "intermediate",
      "profile_specialties": ["arboreal"]
    }
  ]
}
```

---

## Frontend Pages & Components

### 1. Profile Settings Page (`/dashboard/settings/profile`)
Form to update:
- Display name
- Avatar URL
- Bio (textarea)
- Location
- Experience level (dropdown)
- Years keeping (number)
- Specialties (multi-select checkboxes)
- Social links (Instagram, YouTube, Website)
- **Privacy toggle**: Public/Private collection

### 2. Public Profile Page (`/keeper/{username}`)
Display:
- Profile header (avatar, name, bio, stats)
- Experience badge
- Social links
- Collection grid (if public)
- "Follow" button (future feature)
- View counter (optional)

### 3. Discover Keepers Page (`/discover` or `/community`)
Browse public collections:
- Filter sidebar (experience level, specialties)
- Sort options (recent, popular, collection size)
- Grid/list of keeper cards
- Search by username

### 4. Dashboard Updates
Add link to:
- "View My Public Profile" (if collection is public)
- "Profile Settings" 
- Privacy indicator badge

---

## Privacy & Security Considerations

1. **Default Private**: All new users start with `collection_visibility = 'private'`
2. **Explicit Opt-In**: Users must explicitly toggle to make collection public
3. **Clear UI**: Prominent privacy indicators throughout UI
4. **Granular Control**: 
   - User-level: collection_visibility (affects all tarantulas)
   - Tarantula-level: visibility (future: allow hiding specific tarantulas even if collection is public)
5. **Data Exposure**: Public profiles only show:
   - Username, display_name, avatar, bio, stats
   - Tarantula basic info (name, species, photo, sex, acquired date)
   - **NOT exposed**: Email, price_paid, source details, private notes, husbandry specifics

---

## Implementation Phases

### Phase 2A: Profile Settings & Privacy (MVP)
1. Migration: Add profile fields to users table
2. Backend: Profile update endpoints
3. Frontend: Profile settings page
4. Frontend: Privacy toggle on dashboard

### Phase 2B: Public Profiles
1. Backend: Public profile endpoint with collection data
2. Frontend: Public profile page `/keeper/{username}`
3. Frontend: "View My Public Profile" link

### Phase 2C: Discovery
1. Backend: Collections discovery endpoint with filters
2. Frontend: Discover/Community page
3. Frontend: Search and filter UI

### Phase 3: Social Features (Future)
1. Follows system
2. Activity feeds
3. Comments on collections
4. Messaging

---

## Migration File Template

File: `d1e2f3g4h5i6_add_community_features.py`

```python
"""add community features

Revision ID: d1e2f3g4h5i6
Revises: c3d4e5f6g7h8
Create Date: 2025-10-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'd1e2f3g4h5i6'
down_revision = 'c3d4e5f6g7h8'
branch_labels = None
depends_on = None

def upgrade():
    # Add profile fields to users
    op.add_column('users', sa.Column('is_public', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('users', sa.Column('profile_bio', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('profile_location', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('profile_experience_level', sa.String(50), nullable=True))
    op.add_column('users', sa.Column('profile_years_keeping', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column('profile_specialties', postgresql.ARRAY(sa.String()), nullable=True))
    op.add_column('users', sa.Column('social_links', postgresql.JSONB(), nullable=True))
    op.add_column('users', sa.Column('collection_visibility', sa.String(20), server_default='private', nullable=False))
    
    # Add visibility to tarantulas
    op.add_column('tarantulas', sa.Column('visibility', sa.String(20), server_default='private', nullable=False))

def downgrade():
    op.drop_column('tarantulas', 'visibility')
    op.drop_column('users', 'collection_visibility')
    op.drop_column('users', 'social_links')
    op.drop_column('users', 'profile_specialties')
    op.drop_column('users', 'profile_years_keeping')
    op.drop_column('users', 'profile_experience_level')
    op.drop_column('users', 'profile_location')
    op.drop_column('users', 'profile_bio')
    op.drop_column('users', 'is_public')
```

---

## Future Enhancements

1. **Verified Badges**: For experienced keepers or breeders
2. **Collection Stats**: Most kept species, rarest species, etc.
3. **Keeper Leaderboards**: Most species, most molts logged, etc.
4. **Collection Tours**: Slideshow/story mode for showcasing collections
5. **Breeding Records**: Public breeding success rates
6. **Care Sheet Contributions**: Let community improve care sheets
7. **Local Keeper Map**: Find keepers near you (opt-in)
8. **Collection Export**: PDF "Collection Catalog" for expos
9. **QR Codes**: Generate QR codes for each tarantula (expo labels)

---

**Status**: Design Complete - Ready for Implementation
**Target**: Phase 2A (Profile Settings & Privacy) first
