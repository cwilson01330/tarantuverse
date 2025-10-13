# Mobile Authentication Token Issue - FIXED ✅

**Status:** RESOLVED  
**Root Cause:** Forum screens were using wrong AsyncStorage key

## Problem
Edit/delete buttons not showing on mobile because there's no auth token stored.

## Root Cause - ACTUAL BUG FOUND!
The mobile app was using **TWO DIFFERENT keys** for storing auth tokens:
- **AuthContext** saves token as: `AsyncStorage.setItem('auth_token', token)`
- **Forum screens** were looking for: `AsyncStorage.getItem('token')`

This meant even when users logged in, the token was saved under `'auth_token'` but forum screens couldn't find it because they were looking for `'token'`!

## Solution ✅
Fixed all forum screens to use the correct key: `'auth_token'`

**Files Fixed:**
- `apps/mobile/app/forums/thread/[id].tsx` (7 instances)
- `apps/mobile/app/forums/[category].tsx` (1 instance)
- `apps/mobile/app/forums/new-thread.tsx` (2 instances)

**Commit:** `0146205` - "fix: Use correct auth_token key for AsyncStorage in forum screens"

## Testing
After this fix, when logged in you should see:
```
[Thread] Fetching current user, token exists: true
[Thread] Auth response status: 200
[Thread] Current user ID: 547d4b9e-bc22-4579-a8ae-8315b307b919
[Thread] Edit check: { canEdit: true, ... }
```

And edit buttons will appear on your posts! 🎉
