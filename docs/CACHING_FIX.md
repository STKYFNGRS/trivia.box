# Caching Fix for Trivia.Box

## Issue Description

Players were receiving the same questions when starting a new game immediately after completing one, even though the system was logging that it found 532 recently answered questions to exclude. However, it was only filtering out 36 questions, indicating a caching issue.

## Root Causes

1. **SWR Deduplication**: The SWR configuration had a 60-second deduping interval, causing duplicate requests to return cached data.

2. **Inefficient Filtering**: The `allExcludedQuestions.includes(q.id)` check is less efficient than using a Set, especially for large arrays.

3. **No Cache Busting in Fetcher**: The fetch requests weren't including cache-busting parameters.

4. **No Force Refresh Option**: There was no way to explicitly indicate that a request should bypass any caching.

## Implemented Fixes

### 1. Disabled SWR Deduplication

Modified `SWRProviders.tsx` to:
- Change the dedupingInterval from 60000ms (1 minute) to 0, disabling deduplication entirely.

```jsx
dedupingInterval: 0, // Disable deduping to prevent caching
```

### 2. Improved Fetch Cache Control

Updated the `fetcher.ts` to:
- Add a timestamp parameter to game/session-related URLs
- Set Cache-Control headers to prevent caching
- Ensure we're bypassing any browser or CDN caching

```javascript
// Add a timestamp to URLs for APIs that might be cached
if (fetchUrl.includes('/api/game') || fetchUrl.includes('session')) {
  const separator = fetchUrl.includes('?') ? '&' : '?';
  fetchUrl = `${fetchUrl}${separator}_t=${Date.now()}`;
}

// Direct fetch without URL constructor
const res = await fetch(fetchUrl, {
  headers: {
    'Cache-Control': 'no-cache, no-store',
    'Pragma': 'no-cache'
  }
});
```

### 3. Improved Question Filtering

Enhanced the exclusion logic in `route.ts` to:
- Use a Set for more efficient lookups
- Add validation to ensure excluded questions are properly filtered
- Warn if any excluded questions somehow remain in the set

```javascript
// Ensure we're strictly filtering out all excluded questions
const excludedSet = new Set(allExcludedQuestions);
finalQuestions = finalQuestions.filter(q => !excludedSet.has(q.id));

// Double-check that all excluded questions are actually filtered out
const remainingExcluded = finalQuestions.filter(q => excludedSet.has(q.id));
if (remainingExcluded.length > 0) {
  console.warn(`WARNING: ${remainingExcluded.length} excluded questions still remain in the set`);
}
```

### 4. Added Force Refresh Option

Added a `forceRefresh` parameter to game session creation:
- Allows clients to explicitly bypass any caching
- Generates a unique identifier for each force refresh request

```javascript
const { 
  questionCount = 10, 
  category, 
  difficulty = 'mixed', 
  excludeQuestions = [], 
  walletAddress,
  forceRefresh = false, // Add force refresh flag
} = jsonData;

// If forceRefresh is true, add something to bust any caches
const cacheBuster = forceRefresh ? `-force-${uniqueId}` : '';
```

## How to Verify the Fix

1. Complete a game session and submit your score
2. Immediately start a new game with the same settings
3. You should now see entirely different questions
4. Check the server logs to verify proper filtering of recently answered questions

## Further Improvements

Consider these additional enhancements:

1. **Persistent Cache Control**:
   - Add a game ID or session ID to each question to track which game it was used in
   - Store these in a separate table for more precise tracking

2. **Front-end Cache Busting**:
   - Ensure that the UI components always set `forceRefresh: true` when starting a new game

3. **Question Set Verification**:
   - Add a check in the UI to compare the new question set with recently played questions
   - Show a warning if too many repeat questions are detected
