# Retweet Filter - QA Checklist

## Installation Testing

- [ ] Load unpacked extension in Chrome (chrome://extensions)
- [ ] Extension icon appears in toolbar
- [ ] No errors in extension console (inspect service worker)
- [ ] Popup opens when clicking extension icon

## Core Functionality

### Capture Testing
- [ ] Navigate to x.com and log in
- [ ] Find a tweet and click retweet button
- [ ] Confirm retweet
- [ ] **VERIFY**: Toast notification appears "Retweet captured"
- [ ] **VERIFY**: Popup shows updated count within 3 seconds
- [ ] Open popup and verify the retweet appears with:
  - [ ] Correct author handle
  - [ ] Correct tweet text
  - [ ] Correct timestamp

### Quote Retweet Testing
- [ ] Quote retweet a post with added comment
- [ ] **VERIFY**: Both original text and your comment are captured
- [ ] **VERIFY**: Quoted author is recorded

### Manual Capture
- [ ] Hover over a tweet on X.com
- [ ] Open extension popup
- [ ] Click "Capture Current"
- [ ] **VERIFY**: Tweet is captured

## Dashboard Testing

### Navigation
- [ ] Click dashboard icon in popup (or Cmd/Ctrl+D)
- [ ] **VERIFY**: Dashboard opens in new tab
- [ ] All navigation items work: Archive, Categories, Import, Settings

### Search & Filter
- [ ] Enter search term in search bar
- [ ] **VERIFY**: Results filter in real-time
- [ ] **VERIFY**: Matching terms highlighted
- [ ] Click category filter chip
- [ ] **VERIFY**: Results filter by category
- [ ] Select date range
- [ ] **VERIFY**: Results filter by date
- [ ] Check "Has Media" filter with media tweet
- [ ] **VERIFY**: Only media tweets shown

### Tagging
- [ ] Click "Tags" button on a result
- [ ] Add a manual tag
- [ ] Click Save
- [ ] **VERIFY**: Tag persists on reload
- [ ] **VERIFY**: Auto-tag suggestions appear for matching content

### Bulk Operations
- [ ] Check multiple items
- [ ] **VERIFY**: Bulk actions bar appears
- [ ] Click "Add Tags"
- [ ] Add tag and save
- [ ] **VERIFY**: All selected items updated
- [ ] Select items and click Delete
- [ ] Confirm deletion
- [ ] **VERIFY**: Items removed

### Pagination
- [ ] With 50+ retweets, pagination appears
- [ ] Click Next/Previous
- [ ] **VERIFY**: Pages load correctly

## Import Testing

### X Archive Import
- [ ] Go to Import tab
- [ ] Click "Select Archive File"
- [ ] Choose a tweets.js file from X archive
- [ ] **VERIFY**: Import progress shown
- [ ] **VERIFY**: Import complete message with counts
- [ ] **VERIFY**: Imported tweets appear in archive
- [ ] Import same file again
- [ ] **VERIFY**: "0 new, X duplicates" (no duplicates created)

### CSV Import
- [ ] Create test CSV with format:
  ```
  tweet_id,user_handle,text,date
  123,test,Test tweet,2024-01-15
  ```
- [ ] Import CSV
- [ ] **VERIFY**: Tweet appears with correct data

### Nitter RSS (if available)
- [ ] Enter Nitter RSS URL
- [ ] Click Import
- [ ] **VERIFY**: Retweets imported

## Categories Testing

- [ ] Go to Categories tab
- [ ] **VERIFY**: Default categories shown
- [ ] Click "Add Category"
- [ ] Enter name and keywords
- [ ] Save
- [ ] **VERIFY**: Category appears
- [ ] Edit a category
- [ ] **VERIFY**: Changes saved
- [ ] Delete a category
- [ ] **VERIFY**: Category removed

## Settings Testing

### Auto-Tagging
- [ ] Toggle auto-tag setting
- [ ] Capture new retweet
- [ ] **VERIFY**: Auto-tags applied (or not) based on setting

### Export
- [ ] Click "Export All Data"
- [ ] **VERIFY**: JSON file downloads
- [ ] **VERIFY**: File contains retweets, settings, categories

## Performance Testing

- [ ] Import 100+ retweets (use demo seed)
- [ ] **VERIFY**: Dashboard loads in < 3 seconds
- [ ] Search responds quickly
- [ ] Scrolling is smooth

## Edge Cases

- [ ] Retweet a tweet with emojis
- [ ] **VERIFY**: Emojis preserved
- [ ] Retweet a tweet with long text
- [ ] **VERIFY**: Text not truncated in storage
- [ ] Open multiple X.com tabs
- [ ] Retweet in each
- [ ] **VERIFY**: All captured correctly

## Cleanup Testing

- [ ] In Settings, click "Clear All Data"
- [ ] Confirm
- [ ] **VERIFY**: All data cleared
- [ ] Remove extension
- [ ] Reinstall extension
- [ ] **VERIFY**: Fresh start, no data persisted

## Cross-Browser (Optional)

- [ ] Test in Chrome
- [ ] Test in Edge (Chromium)
- [ ] Test in Brave

## Acceptance Criteria Status

| Criteria | Status |
|----------|--------|
| Retweet captured within 3s with correct data | |
| Search returns correct results by keyword | |
| Category filters work correctly | |
| Manual tag assignment persists | |
| Auto-tag suggestions appear for matching content | |
| Bulk tag operation updates multiple items | |
| X archive import works without duplicates | |
| CSV import works without duplicates | |
| Dashboard loads with 1000+ items performantly | |
| Extension uninstall clears all local data | |

## Notes

_Record any issues or observations here:_

---

**Tester:** _________________ **Date:** _________________

**Result:** [ ] PASS [ ] FAIL

**Blockers:** _________________
