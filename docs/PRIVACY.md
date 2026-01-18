# Retweet Filter - Privacy Policy

## Overview

Retweet Filter is designed with privacy as a core principle. Your data belongs to you, and we've built the extension to ensure that.

## Data Collection

### What We Collect
When you use Retweet Filter, the extension collects:
- Tweet ID
- Tweet text content
- Author username and display name
- Media URLs (images, videos)
- Timestamp of when you captured the retweet
- Original tweet creation time
- Tags you assign
- System-suggested tags

### What We DON'T Collect
- Your X/Twitter credentials
- Your browsing history
- Personal information
- Data from any site other than X.com/Twitter.com
- Analytics or telemetry data

## Data Storage

### Local-First Architecture
All captured data is stored **locally on your device** using IndexedDB. This means:
- Your data never leaves your browser by default
- No account required
- Works offline
- You have full control

### Optional Server Sync
If you choose to enable server sync:
- Data is encrypted in transit (HTTPS)
- You control the sync server (self-hosted or your own API)
- Sync is opt-in and can be disabled anytime
- API tokens are stored encrypted locally

## Data Access

### Extension Permissions
The extension only requests necessary permissions:

| Permission | Purpose |
|------------|---------|
| `storage` | Store captured retweets locally |
| `activeTab` | Access X.com tabs you're viewing |
| `host_permissions: x.com, twitter.com` | Run capture script on X |

### Third-Party Access
- No data is shared with third parties
- No analytics services
- No advertising networks
- No data brokers

## Data Retention

### Local Data
- Data is stored indefinitely until you delete it
- Uninstalling the extension removes all local data
- You can export before uninstalling

### Synced Data
- You control retention on your sync server
- Disconnecting sync removes the sync token
- Local data remains after disconnecting

## Your Rights

### Access
- View all your data in the Dashboard
- Export all data as JSON at any time

### Deletion
- Delete individual retweets
- Bulk delete with filters
- Clear all data in Settings
- Uninstall removes everything

### Portability
- Export to JSON format
- Import to other systems
- No vendor lock-in

## Security Measures

### Content Script Isolation
- Scripts run in isolated context
- No access to X's JavaScript context
- DOM-only access for capture

### Storage Security
- IndexedDB is browser-sandboxed
- Data not accessible to other extensions
- API tokens encoded before storage

### Code Transparency
- Fully open source
- No minification
- Auditable codebase

## Manifest V3 Compliance

This extension uses Manifest V3, Chrome's latest extension platform:
- Service worker instead of background page
- Stricter content security policy
- No remote code execution
- Declarative permissions

## Changes to This Policy

If we make changes to this privacy policy:
- Changes will be documented in the changelog
- Significant changes will be noted in release notes
- The extension will never add data collection without consent

## Contact

For privacy concerns or questions:
- Open a GitHub issue (public)
- Email: privacy@example.com (private)

## Summary

| Question | Answer |
|----------|--------|
| Does the extension track me? | No |
| Is my data sent to a server? | Only if you enable sync |
| Who can see my data? | Only you |
| Can I delete my data? | Yes, completely |
| Is the code open source? | Yes |
| Does it use analytics? | No |
| Does it show ads? | No |

---

*Last updated: January 2024*

*This privacy policy applies to Retweet Filter version 1.0.0 and later.*
