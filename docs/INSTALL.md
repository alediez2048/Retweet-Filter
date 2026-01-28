# Retweet Filter - Installation Guide

## Quick Start

### Install from Source (Developer Mode)

1. **Download the extension**
   ```bash
   git clone https://github.com/alediez2048/Bookmark-Chrome-Extension.git
   cd Bookmark-Chrome-Extension
   ```

2. **Open Chrome Extensions**
   - Navigate to `chrome://extensions`
   - Enable "Developer mode" (toggle in top-right)

3. **Load the extension**
   - Click "Load unpacked"
   - Select the `extension` folder from the cloned repository

4. **Pin the extension**
   - Click the puzzle piece icon in Chrome toolbar
   - Pin "Retweet Filter" for easy access

### Verify Installation

1. Click the Retweet Filter icon in your toolbar
2. You should see the popup with stats (0 total, 0 today)
3. Navigate to [x.com](https://x.com)
4. Retweet any post
5. Check the popup - you should see "1 today"

## Using the Extension

### Automatic Capture
The extension automatically captures retweets when you:
- Click the retweet button and confirm
- Quote retweet a post
- Use keyboard shortcuts (T) to retweet

### Manual Capture
1. Hover over any tweet on X.com
2. Open the extension popup
3. Click "Capture Current"

### Viewing Your Archive
1. Click the extension icon
2. Click the "Open Dashboard" button (external link icon)
3. Or use keyboard shortcut: Ctrl/Cmd + D

### Searching
- Use the search bar in popup for quick lookups
- Use the full dashboard for advanced search with filters
- Keyboard shortcut: Ctrl/Cmd + K

### Importing Historical Data

#### From X/Twitter Archive
1. Go to [twitter.com/settings/download_your_data](https://twitter.com/settings/download_your_data)
2. Request your archive
3. Download and extract the ZIP file
4. In Retweet Filter dashboard, go to Import
5. Click "Select Archive File"
6. Choose the `data/tweets.js` file

#### From CSV
Create a CSV with these columns:
```csv
tweet_id,user_handle,text,date,url
1234567890,username,"Tweet content",2024-01-15,https://x.com/...
```

#### From Nitter RSS
1. Find your Nitter RSS feed URL (e.g., `https://nitter.net/username/rss`)
2. Paste the URL in the Import section
3. Click "Import from Nitter"

## Configuration

### Categories
Default categories for auto-tagging:
- AI
- Design
- Language Models
- Programming
- Startups
- Science

To add custom categories:
1. Open Dashboard
2. Go to Categories
3. Click "Add Category"
4. Enter name and keywords

### Optional: Server Sync
To sync across devices:
1. Deploy the reference server (see `server/README.md`)
2. In Settings, enable "Sync to external server"
3. Enter your server URL and API token
4. Click "Test Connection"
5. Click "Sync Now"

## Troubleshooting

### Extension not capturing retweets
1. Refresh the X.com page
2. Make sure you're on x.com or twitter.com
3. Check if the extension has the correct permissions

### Search not working
1. Make sure you have retweets captured
2. Try a simpler search term
3. Clear filters and try again

### Import failing
1. Check the file format matches the expected format
2. For archives, make sure you're selecting `tweets.js`
3. Check browser console for error messages

### Performance issues
1. If you have 10,000+ retweets, dashboard may be slow
2. Use search and filters to narrow results
3. Clear old data you don't need

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd + K | Focus search |
| Ctrl/Cmd + D | Open dashboard |
| Escape | Close modals/popup |
| Ctrl/Cmd + A | Select all (in dashboard) |

## Updating

### From Source
```bash
cd Bookmark-Chrome-Extension
git pull origin main
```
Then go to `chrome://extensions` and click the refresh icon on Retweet Filter.

## Uninstalling

1. Go to `chrome://extensions`
2. Find Retweet Filter
3. Click "Remove"
4. Confirm removal

**Note**: This will delete all locally stored data. Export your data first if you want to keep it!

## Support

- Report issues: [GitHub Issues](https://github.com/alediez2048/Bookmark-Chrome-Extension/issues)
- Documentation: [GitHub Wiki](https://github.com/alediez2048/Bookmark-Chrome-Extension/wiki)
