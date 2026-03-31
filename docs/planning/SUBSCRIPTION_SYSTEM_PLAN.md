# Subscription System Implementation

## Overview
Implement a two-tier subscription model to gate premium features like species guide editing while keeping core features free.

## Subscription Tiers

### **Free Tier** (Default)
**Access:**
- ✅ Browse all species
- ✅ Search and filter
- ✅ View complete care sheets
- ✅ Add species to collection
- ✅ Basic forums access
- ✅ Community features
- ✅ Photo uploads (limited)

**Limitations:**
- ❌ Cannot edit species guides
- ❌ Cannot submit new species
- ❌ Basic filters only
- ❌ 10 tarantulas max in collection

### **Premium Tier** ($4.99/month or $49.99/year)
**Everything in Free, plus:**
- ✅ **Edit species care guides** (main premium feature)
- ✅ Submit new species for review
- ✅ Advanced filters and sorting
- ✅ Unlimited collection size
- ✅ Priority support
- ✅ Ad-free experience
- ✅ Early access to new features
- ✅ Custom profile badge
- ✅ Advanced analytics for your collection
- ✅ Bulk photo uploads
- ✅ Export data features

### **Verified Contributor** (Invite-only)
**Everything in Premium, plus:**
- ✅ Direct publish (no review needed)
- ✅ Verified badge
- ✅ Species expert tag
- ✅ Moderator tools
- ✅ Free premium access

---

## Database Schema

### New Table: `subscription_plans`
```sql
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE, -- 'free', 'premium', 'verified'
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    price_monthly DECIMAL(10,2),
    price_yearly DECIMAL(10,2),
    features JSONB, -- List of features
    max_tarantulas INTEGER,
    can_edit_species BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### New Table: `user_subscriptions`
```sql
CREATE TABLE user_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES subscription_plans(id),
    status VARCHAR(20) NOT NULL, -- 'active', 'cancelled', 'expired', 'trial'
    started_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    payment_provider VARCHAR(50), -- 'stripe', 'manual', null
    payment_provider_id VARCHAR(255), -- External subscription ID
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Update `users` table
```sql
ALTER TABLE users ADD COLUMN current_plan_id UUID REFERENCES subscription_plans(id);
ALTER TABLE users ADD COLUMN is_verified_contributor BOOLEAN DEFAULT FALSE;
```

### Update `species` table
```sql
ALTER TABLE species ADD COLUMN last_edited_by UUID REFERENCES users(id);
ALTER TABLE species ADD COLUMN last_edited_at TIMESTAMP;
ALTER TABLE species ADD COLUMN edit_count INTEGER DEFAULT 0;
ALTER TABLE species ADD COLUMN requires_review BOOLEAN DEFAULT TRUE;
```

---

## API Endpoints

### Subscription Management

```python
# GET /api/v1/subscriptions/plans
# Get all available plans

# GET /api/v1/subscriptions/me
# Get current user's subscription status

# POST /api/v1/subscriptions/subscribe
# Create subscription (integrates with payment provider)

# POST /api/v1/subscriptions/cancel
# Cancel subscription (keeps access until expiry)

# GET /api/v1/subscriptions/features
# Get features available to current user
```

### Species Editing (Protected)

```python
# PATCH /api/v1/species/{id}/edit
# Requires: Premium subscription OR verified contributor
# Submit edit (goes to review queue unless verified)

# POST /api/v1/species/submit
# Requires: Premium subscription
# Submit new species for review

# GET /api/v1/species/{id}/edit-history
# View edit history (public)

# GET /api/v1/species/pending-reviews
# Admin only: See pending edits
```

---

## Authentication Middleware

### New Dependency: `require_premium`

```python
from app.utils.dependencies import get_current_user

async def require_premium(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> User:
    """
    Require user to have active premium subscription or be verified contributor
    """
    if current_user.is_verified_contributor:
        return current_user
    
    subscription = db.query(UserSubscription).filter(
        UserSubscription.user_id == current_user.id,
        UserSubscription.status == 'active',
        UserSubscription.expires_at > datetime.now()
    ).first()
    
    if not subscription:
        raise HTTPException(
            status_code=403,
            detail="Premium subscription required for this feature"
        )
    
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.id == subscription.plan_id
    ).first()
    
    if not plan or not plan.can_edit_species:
        raise HTTPException(
            status_code=403,
            detail="Your plan does not include species editing"
        )
    
    return current_user
```

---

## Frontend Implementation

### Subscription Check Utility

```typescript
// utils/subscription.ts

export interface SubscriptionFeatures {
  canEditSpecies: boolean;
  canSubmitSpecies: boolean;
  maxTarantulas: number;
  hasAdvancedFilters: boolean;
  isVerified: boolean;
}

export async function getSubscriptionFeatures(): Promise<SubscriptionFeatures> {
  const token = localStorage.getItem('auth_token');
  if (!token) {
    return DEFAULT_FREE_FEATURES;
  }
  
  const response = await fetch(`${API_URL}/api/v1/subscriptions/features`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  return await response.json();
}

export function canEditSpecies(features: SubscriptionFeatures): boolean {
  return features.canEditSpecies || features.isVerified;
}
```

### UI Components

**Subscription Gate Component:**
```tsx
// components/SubscriptionGate.tsx

interface Props {
  feature: 'editSpecies' | 'submitSpecies' | 'advancedFilters';
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function SubscriptionGate({ feature, children, fallback }: Props) {
  const { features, loading } = useSubscription();
  
  if (loading) return <LoadingSpinner />;
  
  const hasAccess = checkFeatureAccess(features, feature);
  
  if (!hasAccess) {
    return fallback || <UpgradePrompt feature={feature} />;
  }
  
  return <>{children}</>;
}
```

**Usage in Species Edit:**
```tsx
// species/[id]/page.tsx

<SubscriptionGate 
  feature="editSpecies"
  fallback={
    <div className="premium-gate">
      <Lock className="w-12 h-12" />
      <h3>Premium Feature</h3>
      <p>Upgrade to Premium to edit species care guides</p>
      <button onClick={() => router.push('/pricing')}>
        Upgrade Now
      </button>
    </div>
  }
>
  <EditSpeciesForm species={species} />
</SubscriptionGate>
```

---

## Payment Integration

### Phase 1: Manual Subscriptions (MVP)
For initial launch, allow admin to manually assign premium:
- Admin dashboard to manage subscriptions
- Manual payment processing
- Simple enable/disable premium

### Phase 2: Stripe Integration (Post-MVP)
```typescript
// Stripe Checkout integration
- One-time payment for yearly
- Recurring billing for monthly
- Webhook handling for renewals
- Cancellation flow
```

---

## Premium Features Rollout

### Launch Day
- ✅ Species editing for premium
- ✅ Unlimited collection size
- ✅ Premium badge

### Week 2
- ✅ Advanced filters
- ✅ Export features

### Month 2
- ✅ Bulk operations
- ✅ Analytics dashboard

---

## Migration Plan

### Step 1: Add subscription tables
```bash
# Create migration
alembic revision --autogenerate -m "add_subscription_system"
alembic upgrade head
```

### Step 2: Seed default plans
```python
# Seed free and premium plans
free_plan = SubscriptionPlan(
    name='free',
    display_name='Free',
    description='Basic access to all features',
    price_monthly=0,
    price_yearly=0,
    max_tarantulas=10,
    can_edit_species=False
)

premium_plan = SubscriptionPlan(
    name='premium',
    display_name='Premium',
    description='Full access including species editing',
    price_monthly=4.99,
    price_yearly=49.99,
    max_tarantulas=-1,  # unlimited
    can_edit_species=True
)
```

### Step 3: Migrate existing users
```python
# All existing users start on free plan
UPDATE users SET current_plan_id = (SELECT id FROM subscription_plans WHERE name = 'free');
```

### Step 4: Deploy API changes
- Add new endpoints
- Add subscription middleware
- Protect species editing endpoints

### Step 5: Deploy frontend changes
- Add subscription context
- Add subscription gates
- Add pricing page
- Add upgrade prompts

---

## Testing Strategy

### Backend Tests
```python
def test_premium_can_edit_species():
    # Premium user should be able to edit
    
def test_free_cannot_edit_species():
    # Free user should get 403
    
def test_verified_can_edit_without_premium():
    # Verified contributors bypass subscription
```

### Frontend Tests
```typescript
// Test subscription gates
// Test upgrade prompts
// Test feature availability
```

---

## Marketing Copy

### Pricing Page

**Free Forever**
- Perfect for hobbyists
- Browse 50+ species
- Complete care guides
- Join the community
- $0/month

**Premium - $4.99/month**
- Everything in Free
- **Edit & improve care guides**
- Submit new species
- Unlimited collection
- Advanced features
- Support the platform

**Verified Contributor - Invitation Only**
- For recognized experts
- All Premium features FREE
- Direct publish access
- Moderator tools
- Special badge

---

## Timeline

### Week 1: Backend Foundation
- Day 1-2: Database migrations
- Day 3-4: API endpoints
- Day 5: Testing

### Week 2: Frontend Integration
- Day 1-2: Subscription context
- Day 3-4: UI gates and prompts
- Day 5: Pricing page

### Week 3: Species Editing
- Day 1-3: Edit forms
- Day 4-5: Review workflow

### Week 4: Polish & Launch
- Testing
- Bug fixes
- Documentation
- Launch! 🚀

---

**Status:** 📋 Ready to Implement  
**Next Step:** Create database migrations
