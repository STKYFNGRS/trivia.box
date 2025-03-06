# Local Storage Caching Fix for Trivia.Box

## Issue Description

Players were consistently receiving the same questions when starting a new game immediately after completing one, even when different settings weren't selected. This was happening because the game state (including questions) was being cached in localStorage with a 1-hour expiration.

## Root Causes

1. **Client-Side Caching in GameController.ts**: 
   - The game controller was caching the complete game state in localStorage
   - The cache had a 1-hour expiration time before being refreshed
   - The cache key was based only on game parameters (category, difficulty, questionCount)
   - When starting a new game with the same parameters, it retrieved questions from cache

2. **No Cache Invalidation**: 
   - Even after completing a game session, the cached game state remained valid
   - No mechanism existed to invalidate the cache after a game session ended

3. **No Force Refresh Option**:
   - The client wasn't passing any "forceRefresh" flag to the API
   - There was no way to bypass the cache when needed

## Implemented Fixes

### 1. Disable localStorage Caching

We completely disabled the localStorage caching mechanism:

```javascript
// Don't cache game state anymore
/*
if (typeof window !== 'undefined') {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({
      state: gameState,
      timestamp: Date.now()
    }));
  } catch (storageError) {
    console.warn('Failed to cache game state:', storageError);
  }
}
*/
```

### 2. Add forceRefresh Flag

Added a `forceRefresh` parameter to always ensure fresh questions from the server:

```javascript
// Always use forceRefresh to bypass any caching
const forceRefresh = true; 

// Include in API request
body: JSON.stringify({
  category: config.category,
  questionCount: config.questionCount,
  difficulty: config.difficulty || 'mixed',
  walletAddress: config.walletAddress,
  forceRefresh: true, // Always force a refresh
  _t: Date.now() // Add timestamp to prevent caching
})
```

### 3. Add Cache Busting Parameter

Added a timestamp parameter to the request to prevent any HTTP-level caching:

```javascript
_t: Date.now() // Add timestamp to prevent caching
```

## How to Verify the Fix

1. Complete a game session
2. Start a new game with the same settings
3. You should now see entirely different questions
4. The system should fetch fresh questions from the server for each new game

## Additional Improvements

1. **Clear LocalStorage on Game End**:
   - If we were to re-enable caching, we should ensure any game-related localStorage entries are cleared when a game ends
   - This would prevent previously cached questions from being reused

2. **Cache Hash Versioning**:
   - Add a version or session number to cache keys to ensure they're unique for each game session
   - This would allow caching for performance while preventing question reuse

3. **Question History Tracking**:
   - Implement a more robust system for tracking question history on the server
   - This would ensure questions aren't repeated even if the client-side cache is cleared
