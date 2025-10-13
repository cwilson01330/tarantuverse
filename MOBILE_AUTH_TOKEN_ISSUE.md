# Mobile Authentication Token Issue

## Problem
Edit/delete buttons not showing on mobile because there's no auth token stored.

## Debug Logs Show:
```
[Thread] Fetching current user, token exists: false
currentUserId: null
canEdit: null
```

## Root Cause
The mobile app doesn't have an authentication token in AsyncStorage. This means:
1. `fetchCurrentUser()` returns early because `token` is null
2. `currentUserId` remains null
3. Permission check `currentUserId && post.author.id === currentUserId` fails
4. Edit/delete buttons don't render

## Solution
**You need to log in on the mobile app!**

### Steps to Fix:
1. Open the mobile app
2. Navigate to the Profile/Account tab
3. Log in with your credentials (gwizard202)
4. The token will be saved to AsyncStorage
5. Return to the forums
6. Edit buttons should now appear on your posts

## How to Verify It's Working:
After logging in, when you view a thread, you should see:
```
[Thread] Fetching current user, token exists: true
[Thread] Auth response status: 200
[Thread] Current user ID: 547d4b9e-bc22-4579-a8ae-8315b307b919
[Thread] Edit check for first post: {
  currentUserId: "547d4b9e-bc22-4579-a8ae-8315b307b919",
  authorId: "547d4b9e-bc22-4579-a8ae-8315b307b919",
  canEdit: true,
  editingPostId: null
}
```

## Why This Happens
- Web stores the token in `localStorage` which persists across sessions
- Mobile stores the token in `AsyncStorage` which also persists
- BUT if you've never logged in on mobile, or cleared app data, there's no token
- The app doesn't force you to log in to view forums (they're public)
- But editing requires authentication

## Technical Details
The code is working correctly:
- ✅ `fetchCurrentUser()` checks for token
- ✅ Permission check uses `post.author.id === currentUserId`
- ✅ Edit buttons conditionally render based on permissions
- ❌ No token = no `currentUserId` = no edit buttons

The fix is simply **log in on mobile**! 📱
