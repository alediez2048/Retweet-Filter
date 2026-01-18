# Retweet Filter - Reference Backend API

A simple Express.js server that provides optional sync functionality for the Retweet Filter Chrome extension.

## Features

- JWT-based authentication
- SQLite database for persistence
- Batch sync endpoint
- Cross-device sync support
- User isolation (each user's data is separate)

## Setup

1. Install dependencies:
```bash
cd server
npm install
```

2. Create a `.env` file:
```env
PORT=3000
JWT_SECRET=your-very-secure-secret-key-here
ADMIN_SECRET=your-admin-secret-for-token-generation
```

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### Authentication

#### POST /api/auth/token
Generate a JWT token for API access.

```json
{
  "username": "your-username",
  "secret": "your-admin-secret"
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "user_1234567890"
}
```

### Health Check

#### GET /api/health
Check if the server is running.

Headers:
```
Authorization: Bearer <your-token>
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Sync

#### POST /api/sync
Batch upsert retweets.

Headers:
```
Authorization: Bearer <your-token>
Content-Type: application/json
```

Body:
```json
{
  "retweets": [
    {
      "tweet_id": "1234567890",
      "user_handle": "example",
      "user_name": "Example User",
      "text": "Tweet content",
      "quoted_text": "",
      "quoted_author": "",
      "media": [],
      "captured_at": "2024-01-15T10:30:00.000Z",
      "original_created_at": "2024-01-15T09:00:00.000Z",
      "tags": ["AI", "Tech"],
      "auto_tags": ["Programming"],
      "source": "browser",
      "source_url": "https://x.com/example/status/1234567890"
    }
  ]
}
```

Response:
```json
{
  "success": true,
  "inserted": 1,
  "updated": 0,
  "errors": 0
}
```

#### GET /api/retweets
Get all retweets for the authenticated user.

Query parameters:
- `since` (optional): ISO date string to get only retweets updated after this time
- `limit` (optional): Number of results (default: 1000)
- `offset` (optional): Pagination offset (default: 0)

Response:
```json
{
  "retweets": [...],
  "total": 150
}
```

#### GET /api/retweets/:tweetId
Get a specific retweet.

#### DELETE /api/retweets/:tweetId
Delete a specific retweet.

### Statistics

#### GET /api/stats
Get user statistics.

Response:
```json
{
  "total": 150,
  "today": 5,
  "bySource": {
    "browser": 100,
    "archive": 45,
    "csv": 5
  }
}
```

## Extension Configuration

In the Retweet Filter extension settings:

1. Enable sync
2. Enter your server URL: `http://localhost:3000/api`
3. Enter your JWT token (generated via `/api/auth/token`)
4. Click "Test Connection" to verify
5. Click "Sync Now" to sync your retweets

## Production Deployment

For production use:

1. Use a proper secret for `JWT_SECRET` (generate a random 64-character string)
2. Set up HTTPS (required for extension to communicate)
3. Consider using PostgreSQL or MySQL instead of SQLite for better concurrency
4. Add rate limiting
5. Set up proper logging and monitoring
6. Back up the database regularly

## Security Notes

- All endpoints except `/api/auth/token` require authentication
- Tokens expire after 365 days
- Each user can only access their own data
- Passwords/secrets are never stored, only used for token generation
- Consider implementing token refresh for long-running sessions

## Database Schema

The SQLite database (`retweets.db`) contains:

### retweets table
- `id`: Auto-increment primary key
- `user_id`: User identifier
- `tweet_id`: Original tweet ID
- `user_handle`: Tweet author handle
- `user_name`: Tweet author display name
- `text`: Tweet text content
- `quoted_text`: Quoted tweet text (if quote-retweet)
- `quoted_author`: Quoted tweet author
- `media`: JSON array of media attachments
- `captured_at`: When the retweet was captured
- `original_created_at`: Original tweet creation time
- `tags`: JSON array of manual tags
- `auto_tags`: JSON array of auto-suggested tags
- `source`: Capture source (browser, archive, csv, etc.)
- `source_url`: Link to original tweet
- `created_at`: Record creation time
- `updated_at`: Last update time

### users table
- `id`: User identifier
- `username`: Username
- `created_at`: Account creation time
