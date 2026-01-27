# Content Filter Web Dashboard

Web dashboard for the Content Filter extension. Provides analytics, advanced search, and cross-device access to your saved content.

## Features

- **Multi-Platform Support**: View content from Twitter/X, Instagram, TikTok, and YouTube
- **Analytics Dashboard**: See stats and breakdowns by platform
- **Advanced Search**: Full-text search with filters
- **Export**: Download your data as CSV
- **Real-time Sync**: Content captured in extension appears instantly

## Setup

### Prerequisites

- Node.js 20+ (currently using 18, but 20+ recommended)
- Docker Desktop (for local Supabase)

### Local Development

1. **Start Supabase locally**:
   ```bash
   npx supabase start
   ```

2. **Copy environment variables**:
   ```bash
   # Copy the values from `supabase status` output
   cp .env.example .env.local
   # Edit .env.local with your values
   ```

3. **Apply migrations**:
   ```bash
   npx supabase db reset
   ```

4. **Generate TypeScript types**:
   ```bash
   npm run supabase:types
   ```

5. **Start dev server**:
   ```bash
   npm run dev
   ```

6. **Open**: http://localhost:3000

## Project Structure

```
web/
├── src/
│   ├── app/
│   │   ├── (auth)/          # Login/signup pages
│   │   ├── (dashboard)/     # Protected dashboard pages
│   │   │   ├── page.tsx     # Main dashboard
│   │   │   └── analytics/   # Analytics page
│   │   ├── api/             # API routes
│   │   │   └── export/      # CSV export
│   │   └── auth/            # Auth callback
│   ├── lib/
│   │   ├── supabase/        # Supabase clients
│   │   ├── db.ts            # Database helpers
│   │   └── shared/          # Shared logic (categories, etc.)
│   └── types/               # TypeScript types (auto-generated)
├── supabase/
│   ├── migrations/          # Database migrations
│   └── config.toml          # Supabase config
└── package.json
```

## Database Schema

The app uses a unified `posts` table that stores content from all platforms:

- `post_id`: Platform-specific ID
- `platform`: twitter, instagram, tiktok, or youtube
- `text`: Content text/caption
- `media`: JSON array of media items
- `tags`: User-added tags
- `auto_tags`: Auto-suggested tags
- `captured_at`: When it was saved

## Authentication

Supports:
- Email magic links
- Google OAuth
- GitHub OAuth

Configure OAuth providers in `supabase/config.toml` or Supabase dashboard.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## Extension Integration

The extension automatically syncs captured content to this web dashboard when:
1. User is authenticated (via popup "Sign In to Sync" button)
2. Content is captured (retweet, like, save, etc.)

Sync happens in the background and doesn't block the extension.

## Development Notes

- Types are auto-generated from Supabase schema
- Run `npm run supabase:types` after schema changes
- All database queries use Row Level Security (RLS)
- Server components are used for data fetching
- Client components for interactive features
