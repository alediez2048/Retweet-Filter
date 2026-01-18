# Retweet Filter

A privacy-first Chrome extension that captures, searches, and organizes your retweets locally — without using X's API.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Real-time Capture**: Automatically captures retweets as you make them
- **Local-First Storage**: All data stored in IndexedDB on your device
- **Full-Text Search**: Fast client-side search across all your retweets
- **Category Filters**: Pre-configured categories (AI, Design, Programming, etc.)
- **Auto-Tagging**: Automatic tag suggestions based on content keywords
- **Manual Tagging**: Add your own tags and categories
- **Bulk Operations**: Tag or delete multiple retweets at once
- **Historical Import**: Import from X data export, CSV, or Nitter RSS
- **Optional Sync**: Sync to your own server for cross-device access
- **Dark Theme**: Matches X's dark aesthetic

## Quick Start

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/retweet-filter.git
   cd retweet-filter
   ```

2. Generate icons (optional, placeholders included):
   ```bash
   npm run icons
   ```

3. Load in Chrome:
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` folder

4. Pin the extension and start retweeting!

### Usage

1. **Automatic Capture**: Just retweet normally on X.com — the extension captures it
2. **Quick Search**: Click the extension icon for quick lookups
3. **Full Dashboard**: Click the dashboard icon for advanced search and management
4. **Import History**: Go to Dashboard → Import to load your X archive

## Project Structure

```
retweet-filter/
├── extension/           # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── src/
│   │   ├── background/  # Service worker
│   │   ├── content/     # X.com content scripts
│   │   ├── popup/       # Toolbar popup
│   │   ├── dashboard/   # Full archive dashboard
│   │   └── lib/         # Shared modules
│   └── icons/
├── server/              # Optional sync backend
├── tests/               # Test suite
├── docs/                # Documentation
└── scripts/             # Build scripts
```

## Key Constraints

- **No X API**: All capture via DOM observation in browser
- **Privacy-First**: Data never leaves your device unless you enable sync
- **Manifest V3**: Latest Chrome extension platform
- **Minimal Permissions**: Only requests what's necessary

## Documentation

- [Installation Guide](docs/INSTALL.md)
- [Privacy Policy](docs/PRIVACY.md)
- [API Documentation](docs/API.md)
- [QA Checklist](QA_CHECKLIST.md)

## Optional: Server Sync

For cross-device sync, deploy the reference backend:

```bash
cd server
npm install
npm start
```

See [server/README.md](server/README.md) for full setup instructions.

## Demo Data

Load sample retweets for testing:

```javascript
// In browser console on dashboard page
const seedData = await fetch(chrome.runtime.getURL('tests/fixtures/sample-retweets.json')).then(r => r.json());
// Use import functionality to load
```

Or import the file at `tests/fixtures/sample-retweets.json` via the CSV import option.

## Testing

Run unit tests in browser:
1. Open extension dashboard
2. Open browser console
3. Import and run test files

Manual QA checklist: [QA_CHECKLIST.md](QA_CHECKLIST.md)

## Acceptance Criteria

| Criteria | Status |
|----------|--------|
| Retweet captured within 3s | ✓ |
| Full-text search works | ✓ |
| Category filters work | ✓ |
| Manual tagging persists | ✓ |
| Auto-tag suggestions appear | ✓ |
| Bulk operations work | ✓ |
| X archive import works | ✓ |
| CSV import works | ✓ |
| Dashboard performant with 1000+ items | ✓ |

## Tech Stack

- **Storage**: IndexedDB (via custom wrapper)
- **Search**: Custom fuzzy search (Fuse.js-compatible)
- **UI**: Vanilla JavaScript (no framework)
- **Theme**: CSS Variables (X Dark Theme)
- **Backend**: Express.js + SQLite (optional)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by the need to organize retweets without paying for X Premium
- Built with privacy as a core principle
- X/Twitter dark theme colors for visual consistency
