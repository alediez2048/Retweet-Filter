# Deployment Guide

This guide covers deploying the web app to production.

## Prerequisites

1. Supabase account (free tier works)
2. Vercel account (free tier works)
3. Docker Desktop installed (for local Supabase development)

## Step 1: Deploy Supabase

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note your project URL and anon key from Settings > API

### 1.2 Link Local Project to Supabase

```bash
cd web
npx supabase login
npx supabase link --project-ref your-project-ref
```

### 1.3 Push Migrations

```bash
npx supabase db push
```

### 1.4 Get Production Keys

Get your production keys from the Supabase Dashboard:

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project: **Bookmark Chrome Extension**
3. Go to **Settings** → **API**
4. Copy these values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ Keep this secret!)

Or get them via CLI:
```bash
npx supabase status -o env
```

Save these values for Step 3 (Vercel deployment).

## Step 2: Configure OAuth (Optional)

If you want Google OAuth, follow these detailed steps:

### 2.1 Google OAuth Setup

1. **Create Google OAuth Credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Go to **APIs & Services** > **Credentials**
   - Click **Create Credentials** > **OAuth client ID**
   - Application type: **Web application**
   - Name: "Content Filter" (or your app name)
   - **Authorized JavaScript origins** (required):
     - Add: `https://jmzletrzuwhegfwhaned.supabase.co`
   - **Authorized redirect URIs**: 
     - For production: `https://jmzletrzuwhegfwhaned.supabase.co/auth/v1/callback`
     - For local dev (optional): `http://localhost:54321/auth/v1/callback`
   - Click **Create**
   - **Copy the Client ID and Client Secret**

2. **Configure in Supabase:**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard)
   - Select your project: **Bookmark Chrome Extension**
   - Go to **Authentication** > **Providers**
   - Find **Google** and click to expand
   - Toggle **Enable Google provider**
   - Paste your **Client ID** and **Client Secret**
   - Click **Save**

### 2.2 Update Redirect URLs

After deploying to Vercel (Step 3), come back and add your production callback URL:

1. In Supabase Dashboard > **Authentication** > **URL Configuration**
2. Add to **Redirect URLs**: `https://your-app.vercel.app/auth/callback`
3. Click **Save**

**Note:** For local development, the redirect URL `http://localhost:3000/auth/callback` should already work if you configured it in `supabase/config.toml`.

## Step 3: Deploy to Vercel

### 3.1 Install Vercel CLI

```bash
npm i -g vercel
```

### 3.2 Deploy

```bash
cd web
vercel
```

Follow the prompts. When asked about environment variables, you can add them later.

### 3.3 Set Environment Variables

In Vercel Dashboard:
1. Go to your project > Settings > Environment Variables
2. Add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase API URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = your service role key

Or via CLI:
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

### 3.4 Deploy to Production

```bash
vercel --prod
```

## Step 4: Update Extension

### 4.1 Update Sync URLs

Edit `extension/src/background/service-worker.js`:

Find the `syncPostToSupabase` function and update:
```javascript
const SUPABASE_URL = 'https://your-project.supabase.co'
const SUPABASE_ANON_KEY = 'your-production-anon-key'
```

### 4.2 Update Manifest

Edit `extension/manifest.json`:

Update `host_permissions` to include your production URLs:
```json
"host_permissions": [
  // ... existing permissions ...
  "https://your-app.vercel.app/*",
  "https://your-project.supabase.co/*"
]
```

### 4.3 Update Popup Login URL

Edit `extension/src/popup/popup.js`:

Find the login button handler and update:
```javascript
chrome.tabs.create({ url: 'https://your-app.vercel.app/login' });
```

## Step 5: Test

1. Load the extension in Chrome
2. Click "Sign In to Sync" in the popup
3. Sign in via the web dashboard
4. Make a retweet/post on any platform
5. Check the web dashboard - it should appear!

## Troubleshooting

### Extension can't connect to Supabase

- Check `host_permissions` in manifest.json includes your Supabase URL
- Verify the SUPABASE_URL and ANON_KEY are correct
- Check browser console for CORS errors

### Web dashboard shows no posts

- Verify RLS policies are set correctly
- Check that the user is authenticated
- Verify the extension is syncing (check service worker console)

### Migration errors

- Make sure you're linked to the correct Supabase project
- Check that migrations haven't been applied already
- Try `npx supabase db reset` locally first
