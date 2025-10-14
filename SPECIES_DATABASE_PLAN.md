# Species Database Implementation Plan

## Current State Analysis

### ✅ What We Have
1. **Backend (FastAPI)**
   - Complete `Species` model with all fields (taxonomy, husbandry, feeding, care)
   - Full CRUD API endpoints
   - Search functionality (scientific and common names)
   - Community submission support
   - Verification system

2. **Database Schema**
   - Rich taxonomy fields (scientific_name, common_names, genus, family)
   - Comprehensive care data (temperature, humidity, enclosure sizes)
   - Feeding schedules by life stage
   - Community features (ratings, verification, times_kept)
   - Full-text search capability

3. **Partial UI**
   - Web: Species detail page exists (basic layout)
   - Mobile: Placeholder screen ("Coming soon!")

### ❌ What We Need

1. **Species List/Browse Page**
   - Filter by care level, type, region
   - Sort by name, popularity, rating
   - Search functionality
   - Grid/list view toggle

2. **Enhanced Detail Pages**
   - Better visual design
   - Care guide sections
   - User ratings/reviews
   - "Add to Collection" button

3. **Mobile Implementation**
   - Complete species list screen
   - Detail view
   - Search and filter
   - Offline support

4. **Content**
   - Seed database with popular species
   - Care guides and images
   - Community submission workflow

---

## Recommended Implementation Approach

### Phase 1: Species List & Browse (Priority: HIGH)

**Goal:** Allow users to discover and browse species

#### Web Implementation
**Page:** `/apps/web/src/app/species/page.tsx` (NEW)

**Features:**
- Grid layout with species cards (image, name, care level)
- Search bar at top
- Filter sidebar:
  - Care Level (Beginner/Intermediate/Advanced)
  - Type (Terrestrial/Arboreal/Fossorial)
  - Region (dropdown)
  - Verified only (toggle)
- Sort options (A-Z, Popular, Rating)
- Pagination or infinite scroll
- Loading states and skeletons

**UI Design:**
```
┌────────────────────────────────────────────┐
│  Search: [_______________] [🔍]            │
├──────────┬─────────────────────────────────┤
│ Filters  │  Species Grid                   │
│          │  ┌────┐ ┌────┐ ┌────┐          │
│ Care     │  │ T  │ │ T  │ │ T  │          │
│ □ Beginner│ │img │ │img │ │img │          │
│ □ Inter  │  │Name│ │Name│ │Name│          │
│ □ Advanced│ └────┘ └────┘ └────┘          │
│          │                                  │
│ Type     │  Load More...                   │
│ □ Terr   │                                  │
│ □ Arb    │                                  │
│ □ Foss   │                                  │
└──────────┴─────────────────────────────────┘
```

#### Mobile Implementation
**Screen:** `apps/mobile/app/(tabs)/species.tsx` (REPLACE)

**Features:**
- Search bar at top
- Filter chips (horizontal scroll)
- Vertical list/grid toggle
- Species cards with image thumbnail
- Pull-to-refresh
- Infinite scroll

**UI Design:**
```
┌─────────────────────────────┐
│ 📚 Species Database         │
├─────────────────────────────┤
│ [Search species...]    [🔍] │
├─────────────────────────────┤
│ < Beginner | Arboreal | >   │ (filter chips)
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ [img] T. albopilosus    │ │
│ │ Beginner • Terrestrial  │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ [img] G. pulchra        │ │
│ │ Beginner • Terrestrial  │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

---

### Phase 2: Enhanced Species Detail Page (Priority: HIGH)

**Goal:** Provide comprehensive care information

#### Web Enhancement
**Page:** `/apps/web/src/app/species/[id]/page.tsx` (ENHANCE EXISTING)

**Sections:**
1. **Header**
   - Hero image (full width)
   - Scientific name (large)
   - Common names (chips)
   - Care level badge
   - "Add to Collection" button
   - Verified badge

2. **Quick Stats Bar**
   - Adult size | Temperament | Type | Growth rate
   - Visual icons for each

3. **Care Requirements (Tabs or Accordion)**
   - **Environment**
     - Temperature range (with gauge)
     - Humidity range (with gauge)
     - Enclosure sizes by life stage
     - Substrate info
   - **Feeding**
     - Prey size
     - Frequency by life stage
     - Special notes
   - **Behavior**
     - Temperament details
     - Webbing amount
     - Burrowing habits
     - Water dish needs

4. **Care Guide**
   - Markdown-rendered full guide
   - Sections for setup, feeding, maintenance

5. **Community Section**
   - Rating display (stars)
   - "X keepers have this species"
   - Link to community discussions

#### Mobile Implementation
**Screen:** `apps/mobile/app/species/[id].tsx` (NEW)

**Similar sections, optimized for mobile:**
- Vertical scrolling layout
- Collapsible sections
- Touch-friendly gauges/charts
- Swipeable image gallery
- Bottom action bar (Add to Collection)

---

### Phase 3: Search & Filter System (Priority: MEDIUM)

**Backend:** Already exists (`/api/v1/species/search`)

**Frontend Integration:**
- Autocomplete search component
- Debounced API calls
- Search history (local storage)
- Recent searches
- Popular searches

**Features:**
- Search by scientific name
- Search by common name
- Fuzzy matching
- Highlight matched terms
- Show genus/family in results

---

### Phase 4: Community Features (Priority: MEDIUM)

**Goal:** Enable user contributions and engagement

#### Features:
1. **Species Submission**
   - Form for adding new species
   - Image upload
   - Review before publish
   - Admin verification workflow

2. **Ratings & Reviews**
   - Star rating (1-5)
   - Text review
   - Photos from keepers
   - Helpful votes

3. **"I Keep This" Feature**
   - Track species in community
   - Show popularity
   - Connect with other keepers

4. **Care Sheet Contributions**
   - Suggest edits
   - Share experiences
   - Add photos

---

### Phase 5: Advanced Features (Priority: LOW)

**Can be added later:**

1. **Comparison Tool**
   - Side-by-side species comparison
   - Compare care requirements
   - Find similar species

2. **Favorites/Bookmarks**
   - Save favorite species
   - Create wish lists
   - Share lists

3. **Filter Presets**
   - "Best for Beginners"
   - "Colorful Species"
   - "Low Maintenance"
   - "New World vs Old World"

4. **Species Relationships**
   - "Similar species"
   - "If you like X, you might like Y"
   - Genus browsing

5. **Educational Content**
   - Videos
   - Care guides
   - Common mistakes
   - Setup examples

---

## Data Strategy

### Content Population

**Option 1: Manual Entry**
- Pros: High quality, curated
- Cons: Time-consuming
- Use for: Initial 20-30 popular species

**Option 2: Community Submission**
- Pros: Scales naturally, diverse content
- Cons: Needs moderation
- Use for: Growing the database

**Option 3: Import from External Source**
- Pros: Fast population
- Cons: May need cleanup/verification
- Use for: Bulk initial data

**Recommendation:** Combine all three
1. Manually add 25-50 most popular species with complete data
2. Enable community submissions with verification
3. Consider importing from reputable sources (with permission)

### Image Strategy

**Options:**
1. **User Uploads** - S3/R2 storage
2. **External URLs** - Link to reputable sources
3. **Placeholder Images** - Use until real images available

**Recommendation:** Start with external URLs, transition to R2 uploads

---

## Technical Implementation

### API Enhancements Needed

```python
# Add these endpoints:

@router.get("/filters")
async def get_filter_options():
    """Get available filter options (care levels, types, regions)"""
    pass

@router.get("/popular")
async def get_popular_species():
    """Get most kept species"""
    pass

@router.post("/{species_id}/rate")
async def rate_species():
    """Submit a rating"""
    pass

@router.post("/{species_id}/keep")
async def mark_keeping():
    """Mark that user keeps this species"""
    pass
```

### Frontend Components Needed

**Shared Components (Web & Mobile):**
- SpeciesCard
- SpeciesSearchBar
- CareRequirementGauge
- SpeciesFilters
- SpeciesTags

**Web-Specific:**
- SpeciesGrid (responsive grid)
- FilterSidebar
- ComparisonTable

**Mobile-Specific:**
- SpeciesList (FlatList)
- FilterChips (horizontal scroll)
- SpeciesActionSheet

---

## Implementation Order

### Week 1: Foundation
1. ✅ Review existing backend (done)
2. Create species list page (web)
3. Create species list screen (mobile)
4. Implement search integration

### Week 2: Details
1. Enhance species detail page (web)
2. Create species detail screen (mobile)
3. Add care requirement visualizations
4. Implement "Add to Collection" flow

### Week 3: Filters & Polish
1. Build filter system (web & mobile)
2. Add sort functionality
3. Implement loading/error states
4. Add pagination/infinite scroll

### Week 4: Content & Testing
1. Seed database with 25-50 species
2. Add images and care guides
3. Test all functionality
4. Fix bugs and polish UI

---

## Success Metrics

**MVP Success Criteria:**
- [ ] Users can browse 25+ species
- [ ] Users can search by name
- [ ] Users can filter by care level and type
- [ ] Users can view complete care sheets
- [ ] Users can add species to their collection
- [ ] Mobile and web feature parity

**Quality Metrics:**
- Fast search (<500ms)
- Images load smoothly
- Responsive on all devices
- Accessible (ARIA labels, keyboard nav)
- SEO-friendly (species pages indexed)

---

## Next Steps

**Immediate Actions:**
1. Decide on content strategy (how many species to start with?)
2. Gather images and care guides for initial species
3. Choose which phase to start with (recommend Phase 1)
4. Set timeline for MVP

**Questions to Discuss:**
1. Should we allow community submissions from day 1?
2. Do we need moderation tools before launch?
3. What's the priority: more species or richer data?
4. Should species pages be publicly accessible (SEO)?
5. Do we need offline support for mobile?

---

**Status:** 📋 Planning Phase  
**Date:** October 13, 2025  
**Next Decision:** Choose implementation approach and timeline
