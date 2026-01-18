# Retweet Filter - API Documentation

## Extension Messaging API

The extension uses Chrome's messaging system for communication between components.

### Message Types

#### CAPTURE_RETWEET
Capture a new retweet from content script.

```javascript
chrome.runtime.sendMessage({
  type: 'CAPTURE_RETWEET',
  data: {
    tweet_id: '1234567890',
    user_handle: 'username',
    user_name: 'Display Name',
    text: 'Tweet content',
    quoted_text: '',  // Optional
    quoted_author: '', // Optional
    media: [],
    original_created_at: '2024-01-15T10:00:00Z',
    source_url: 'https://x.com/username/status/1234567890'
  }
});
```

#### GET_RETWEETS
Get paginated retweets.

```javascript
const response = await chrome.runtime.sendMessage({
  type: 'GET_RETWEETS',
  data: {
    page: 1,
    pageSize: 50,
    sortBy: 'captured_at',
    sortOrder: 'desc'
  }
});

// Response:
{
  success: true,
  data: {
    items: [...],
    total: 150,
    page: 1,
    pageSize: 50,
    totalPages: 3
  }
}
```

#### SEARCH_RETWEETS
Full-text search with filters.

```javascript
const response = await chrome.runtime.sendMessage({
  type: 'SEARCH_RETWEETS',
  data: {
    query: 'GPT',
    filters: {
      tags: ['AI'],
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      source: 'browser',
      hasMedia: true
    }
  }
});
```

#### UPDATE_TAGS
Update tags for a retweet.

```javascript
await chrome.runtime.sendMessage({
  type: 'UPDATE_TAGS',
  data: {
    id: 'retweet-uuid',
    tags: ['AI', 'Important']
  }
});
```

#### BULK_UPDATE_TAGS
Update tags for multiple retweets.

```javascript
await chrome.runtime.sendMessage({
  type: 'BULK_UPDATE_TAGS',
  data: {
    ids: ['uuid1', 'uuid2', 'uuid3'],
    tagsToAdd: ['Reviewed'],
    tagsToRemove: ['Pending']
  }
});
```

#### DELETE_RETWEET
Delete a single retweet.

```javascript
await chrome.runtime.sendMessage({
  type: 'DELETE_RETWEET',
  data: { id: 'retweet-uuid' }
});
```

#### IMPORT_DATA
Import historical data.

```javascript
// Archive import
const response = await chrome.runtime.sendMessage({
  type: 'IMPORT_DATA',
  data: {
    type: 'archive',
    data: tweetsJsContent
  }
});

// CSV import
const response = await chrome.runtime.sendMessage({
  type: 'IMPORT_DATA',
  data: {
    type: 'csv',
    data: csvContent
  }
});

// Nitter RSS import
const response = await chrome.runtime.sendMessage({
  type: 'IMPORT_DATA',
  data: {
    type: 'nitter',
    data: 'https://nitter.net/username/rss'
  }
});
```

#### EXPORT_DATA
Export all data.

```javascript
const response = await chrome.runtime.sendMessage({
  type: 'EXPORT_DATA'
});

// Response:
{
  success: true,
  data: {
    version: 1,
    exported_at: '2024-01-15T10:00:00Z',
    retweets: [...],
    settings: {...},
    categories: {...},
    savedSearches: [...]
  }
}
```

#### GET_STATS
Get statistics.

```javascript
const response = await chrome.runtime.sendMessage({
  type: 'GET_STATS'
});

// Response:
{
  success: true,
  data: {
    total: 150,
    today: 5,
    bySource: { browser: 100, archive: 50 },
    byTag: { AI: 45, Design: 30, ... },
    unsynced: 10
  }
}
```

#### GET_CATEGORIES / SET_CATEGORY / DELETE_CATEGORY
Manage categories.

```javascript
// Get all
const response = await chrome.runtime.sendMessage({
  type: 'GET_CATEGORIES'
});

// Set
await chrome.runtime.sendMessage({
  type: 'SET_CATEGORY',
  data: {
    name: 'Machine Learning',
    keywords: ['ML', 'neural', 'model', 'training']
  }
});

// Delete
await chrome.runtime.sendMessage({
  type: 'DELETE_CATEGORY',
  data: { name: 'Machine Learning' }
});
```

#### SAVED SEARCHES
Manage saved searches.

```javascript
// Get
const searches = await chrome.runtime.sendMessage({
  type: 'GET_SAVED_SEARCHES'
});

// Save
await chrome.runtime.sendMessage({
  type: 'SAVE_SEARCH',
  data: {
    name: 'AI Tweets',
    query: 'GPT',
    filters: { tags: ['AI'] }
  }
});

// Delete
await chrome.runtime.sendMessage({
  type: 'DELETE_SAVED_SEARCH',
  data: { id: 'search-uuid' }
});
```

## Database Schema

### Retweets Table
```javascript
{
  id: string,              // UUID
  tweet_id: string,        // Twitter ID
  user_handle: string,     // @username
  user_name: string,       // Display name
  text: string,            // Content
  quoted_text: string,     // Quote content
  quoted_author: string,   // Quote author
  media: Array<{
    type: 'image' | 'video' | 'gif',
    url: string,
    thumb_url: string
  }>,
  captured_at: string,     // ISO date
  original_created_at: string,
  tags: string[],          // Manual
  auto_tags: string[],     // System
  source: 'browser' | 'archive' | 'csv' | 'nitter' | 'manual',
  source_url: string,
  is_available: boolean,
  raw_payload: object,
  synced_at: string | null
}
```

### Settings Table
Key-value store for configuration.

### Categories Table
```javascript
{
  name: string,         // Category name
  keywords: string[]    // Matching keywords
}
```

### Saved Searches Table
```javascript
{
  id: string,
  name: string,
  query: string,
  filters: object,
  created_at: string
}
```

## Server Sync API

See `server/README.md` for full server API documentation.

### Quick Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/auth/token` | POST | Generate JWT |
| `/api/sync` | POST | Batch upsert |
| `/api/retweets` | GET | Get all |
| `/api/retweets/:id` | GET | Get one |
| `/api/retweets/:id` | DELETE | Delete one |
| `/api/stats` | GET | Statistics |

### Authentication
All endpoints except `/api/auth/token` require:
```
Authorization: Bearer <jwt-token>
```

## CSV Import Format

Required columns:
- `tweet_id`: Unique tweet identifier
- `text`: Tweet content

Optional columns:
- `user_handle`: Author username
- `user_name`: Author display name
- `date`: ISO date or parseable date string
- `url`: Original tweet URL
- `tags`: Comma-separated tags

Example:
```csv
tweet_id,user_handle,user_name,text,date,url,tags
1234567890,elonmusk,Elon Musk,"Tweet about AI",2024-01-15,https://x.com/elonmusk/status/1234567890,"AI,Tech"
```

## Error Handling

All responses follow this format:
```javascript
// Success
{ success: true, data: ... }

// Error
{ success: false, error: "Error message" }
```

Common error codes:
- `DUPLICATE`: Retweet already exists
- `NOT_FOUND`: Resource not found
- `INVALID_FORMAT`: Bad data format
- `SYNC_FAILED`: Sync operation failed
