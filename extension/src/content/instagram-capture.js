/**
 * Content script for capturing saved posts on Instagram
 * Detects when user bookmarks/saves a post and captures it
 * v1.3.3 - Improved extraction with extensive debugging
 */

(function() {
  'use strict';

  const SCRIPT_VERSION = '1.3.8';
  const DEBUG = true;

  function log(...args) {
    if (DEBUG) console.log('[IG Capture]', ...args);
  }

  // Prevent duplicate injection
  if (window.__instagramFilterInjected === SCRIPT_VERSION) {
    log('Already injected, skipping');
    return;
  }
  window.__instagramFilterInjected = SCRIPT_VERSION;
  log('v' + SCRIPT_VERSION + ' loading...');

  // Track recently captured post IDs to prevent duplicates
  const recentlyCaptured = new Set();
  const DUPLICATE_WINDOW_MS = 5000;

  /**
   * Extract post ID from URL
   */
  function extractPostIdFromUrl(url) {
    if (!url) return null;
    const match = url.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    return match ? match[2] : null;
  }

  /**
   * Find the post container from a clicked element
   * Instagram uses different structures: article, div with role, etc.
   */
  function findPostContainer(clickedElement) {
    if (!clickedElement) {
      log('No clicked element provided');
      return null;
    }

    log('Finding container from:', clickedElement.tagName, clickedElement.className);

    // Try article first (standard posts)
    let container = clickedElement.closest('article');
    if (container) {
      log('Found article container');
      return container;
    }

    // Try div with specific roles (reels, stories)
    container = clickedElement.closest('div[role="dialog"]');
    if (container) {
      log('Found dialog container');
      return container;
    }

    // Try main element
    container = clickedElement.closest('main');
    if (container) {
      // For main, try to find the specific post within
      const article = container.querySelector('article');
      if (article) {
        log('Found article within main');
        return article;
      }
      log('Found main container');
      return container;
    }

    // Try section (some feed layouts)
    container = clickedElement.closest('section');
    if (container && container.querySelector('video, img[src*="cdninstagram"]')) {
      log('Found section container');
      return container;
    }

    // Fallback: walk up to find a container with post-like content
    let el = clickedElement.parentElement;
    let depth = 0;
    while (el && depth < 20) {
      // Check if this element has header + media (typical post structure)
      const hasHeader = el.querySelector('header');
      const hasMedia = el.querySelector('video, img[src*="cdninstagram"]');
      const hasPostLink = el.querySelector('a[href*="/p/"], a[href*="/reel/"]');

      if (hasHeader && (hasMedia || hasPostLink)) {
        log('Found container by walking up', depth, 'levels');
        return el;
      }

      el = el.parentElement;
      depth++;
    }

    log('WARNING: No container found, will try to extract from page');
    return null;
  }

  /**
   * Extract post URL from container or page
   */
  function extractPostUrl(container) {
    // First check the page URL
    const pageUrl = window.location.href;
    if (pageUrl.match(/\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/)) {
      log('Post URL from page:', pageUrl);
      return pageUrl.split('?')[0];
    }

    // Look for post links in the container
    if (container && container !== document) {
      // Strategy 1: Direct post links
      const postLinks = container.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]');
      for (const link of postLinks) {
        const href = link.getAttribute('href');
        if (href && href.match(/\/(p|reel|reels)\/[A-Za-z0-9_-]+/)) {
          const fullUrl = href.startsWith('http') ? href : `https://www.instagram.com${href}`;
          log('Post URL from container link:', fullUrl);
          return fullUrl;
        }
      }

      // Strategy 2: Time element with parent link
      const timeEl = container.querySelector('time[datetime]');
      if (timeEl) {
        const parentLink = timeEl.closest('a');
        if (parentLink) {
          const href = parentLink.getAttribute('href');
          if (href && href.match(/\/(p|reel|reels)\/[A-Za-z0-9_-]+/)) {
            const fullUrl = href.startsWith('http') ? href : `https://www.instagram.com${href}`;
            log('Post URL from time parent:', fullUrl);
            return fullUrl;
          }
        }
      }

      // Strategy 3: Any link that looks like a post URL
      const allLinks = container.querySelectorAll('a[href]');
      for (const link of allLinks) {
        const href = link.getAttribute('href');
        if (href && href.match(/\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/)) {
          const fullUrl = href.startsWith('http') ? href : `https://www.instagram.com${href}`;
          log('Post URL from any link:', fullUrl);
          return fullUrl;
        }
      }
    }

    // Strategy 4: Look in the entire document for time links (fallback)
    const timeLinks = document.querySelectorAll('time[datetime]');
    for (const time of timeLinks) {
      // Only use if this time element is inside our container
      if (container && container !== document && !container.contains(time)) continue;

      const link = time.closest('a[href*="/p/"], a[href*="/reel/"]');
      if (link) {
        const href = link.getAttribute('href');
        if (href) {
          const fullUrl = href.startsWith('http') ? href : `https://www.instagram.com${href}`;
          log('Post URL from time link:', fullUrl);
          return fullUrl;
        }
      }
    }

    // Strategy 5: Check meta tags (useful for single post pages)
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl && ogUrl.content) {
      const match = ogUrl.content.match(/\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/);
      if (match) {
        log('Post URL from og:url:', ogUrl.content);
        return ogUrl.content.split('?')[0];
      }
    }

    log('ERROR: No post URL found anywhere');
    return null; // Return null instead of pageUrl to trigger proper error handling
  }

  /**
   * Extract username from container
   */
  function extractUsername(container) {
    log('Extracting username...');

    const searchRoot = container && container !== document ? container : document;

    // Strategy 1: Look in header for username links
    const header = searchRoot.querySelector('header');
    if (header) {
      const links = header.querySelectorAll('a[href^="/"]');
      for (const link of links) {
        const href = link.getAttribute('href');
        const match = href?.match(/^\/([a-zA-Z0-9._]+)\/?$/);
        if (match && !['p', 'reel', 'reels', 'tv', 'explore', 'direct', 'stories'].includes(match[1])) {
          log('Username from header link:', match[1]);
          return match[1];
        }
      }
    }

    // Strategy 2: Look for any username-style link in container
    const allLinks = searchRoot.querySelectorAll('a[href^="/"]');
    for (const link of allLinks) {
      const href = link.getAttribute('href');
      const match = href?.match(/^\/([a-zA-Z0-9._]+)\/?$/);
      if (match && !['p', 'reel', 'reels', 'tv', 'explore', 'direct', 'stories', 'accounts'].includes(match[1])) {
        // Check if this looks like a username (small text, near top)
        const text = link.textContent?.trim();
        if (text && text === match[1]) {
          log('Username from link text:', match[1]);
          return match[1];
        }
      }
    }

    // Strategy 3: From page title
    const title = document.title;
    const titleMatch = title.match(/@([a-zA-Z0-9._]+)/);
    if (titleMatch) {
      log('Username from title:', titleMatch[1]);
      return titleMatch[1];
    }

    // Strategy 4: From og:description
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) {
      const content = ogDesc.content;
      // Format: "123 likes, 45 comments - username on Instagram..."
      const descMatch = content?.match(/- ([a-zA-Z0-9._]+) on Instagram/);
      if (descMatch) {
        log('Username from og:description:', descMatch[1]);
        return descMatch[1];
      }
    }

    // Strategy 5: Look for spans with @ prefix
    const spans = searchRoot.querySelectorAll('span');
    for (const span of spans) {
      const text = span.textContent?.trim();
      if (text && text.startsWith('@')) {
        const username = text.substring(1);
        if (username.match(/^[a-zA-Z0-9._]+$/)) {
          log('Username from @span:', username);
          return username;
        }
      }
    }

    log('No username found');
    return '';
  }

  /**
   * Extract avatar URL
   */
  function extractAvatar(container) {
    const searchRoot = container && container !== document ? container : document;

    // Look for profile picture in header
    const header = searchRoot.querySelector('header');
    if (header) {
      const img = header.querySelector('img');
      if (img && img.src) {
        log('Avatar from header:', img.src.substring(0, 50) + '...');
        return img.src;
      }
    }

    // Look for any small profile-like image
    const images = searchRoot.querySelectorAll('img[src*="cdninstagram"]');
    for (const img of images) {
      // Profile pictures are usually small and square
      if (img.width && img.width < 80 && img.height && img.height < 80) {
        log('Avatar from small image:', img.src.substring(0, 50) + '...');
        return img.src;
      }
      // Or check for profile picture keywords
      if (img.alt?.toLowerCase().includes('profile')) {
        log('Avatar from profile alt:', img.src.substring(0, 50) + '...');
        return img.src;
      }
    }

    log('No avatar found');
    return '';
  }

  /**
   * Extract caption/description text
   */
  function extractCaption(container) {
    const searchRoot = container && container !== document ? container : document;

    // Strategy 1: Look for h1 (common in reels)
    const h1 = searchRoot.querySelector('h1');
    if (h1) {
      const text = h1.textContent?.trim();
      if (text && text.length > 10) {
        log('Caption from h1:', text.substring(0, 50) + '...');
        return text;
      }
    }

    // Strategy 2: Look for caption in list items (post comments section)
    const listItems = searchRoot.querySelectorAll('ul > div > li, ul > li');
    for (const li of listItems) {
      const spans = li.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent?.trim();
        if (text && text.length > 20 &&
            !text.includes('likes') &&
            !text.includes('views') &&
            !text.match(/^\d+ (likes?|views?|comments?)/)) {
          log('Caption from list item:', text.substring(0, 50) + '...');
          return text;
        }
      }
    }

    // Strategy 3: Look for span with dir="auto" (caption text)
    const autoSpans = searchRoot.querySelectorAll('span[dir="auto"]');
    for (const span of autoSpans) {
      const text = span.textContent?.trim();
      if (text && text.length > 15 &&
          !text.includes('likes') &&
          !text.match(/^\d+[KMB]?\s*(likes?|views?)/i)) {
        log('Caption from span[dir=auto]:', text.substring(0, 50) + '...');
        return text;
      }
    }

    // Strategy 4: From meta description
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc && ogDesc.content) {
      // Parse: "123 likes, 45 comments - username: "caption text""
      const match = ogDesc.content.match(/:\s*[""](.+?)[""]|:\s*(.+)$/);
      if (match) {
        const caption = match[1] || match[2];
        log('Caption from og:description:', caption.substring(0, 50) + '...');
        return caption;
      }
    }

    log('No caption found');
    return '';
  }

  /**
   * Extract media from container - be VERY restrictive to get only the main post media
   * Strategy: Find the first large image/video that comes AFTER the header in DOM order
   */
  function extractMedia(container) {
    const media = [];
    const seenUrls = new Set();

    // For null container, try to get thumbnail from meta tags
    if (!container || container === document) {
      log('No valid container, trying meta tags for thumbnail');
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && ogImage.content) {
        log('Found og:image:', ogImage.content.substring(0, 60));
        media.push({
          type: 'image',
          url: ogImage.content,
          thumb_url: ogImage.content,
          alt_text: 'Video thumbnail'
        });
        return media;
      }
      return media;
    }

    log('Extracting media from:', container.tagName);

    // First, try to find video (takes priority for reels)
    const video = container.querySelector('video');
    if (video) {
      log('Found video element');
      const poster = video.poster;
      const src = video.src || video.querySelector('source')?.src;

      // Strategy 1: Use video poster attribute
      if (poster) {
        log('Found video with poster:', poster.substring(0, 60));
        media.push({
          type: 'video',
          url: src || '',
          thumb_url: poster,
          duration: video.duration || 0
        });
        return media;
      }

      // Strategy 2: Look for an image near the video (Instagram often overlays images on videos)
      const videoParent = video.parentElement;
      if (videoParent) {
        const nearbyImg = videoParent.querySelector('img[src*="cdninstagram"], img[src*="fbcdn"]');
        if (nearbyImg && nearbyImg.src) {
          log('Found image near video:', nearbyImg.src.substring(0, 60));
          media.push({
            type: 'video',
            url: src || '',
            thumb_url: nearbyImg.src,
            duration: video.duration || 0
          });
          return media;
        }
      }

      // Strategy 3: Try og:image meta tag for video thumbnail
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && ogImage.content) {
        log('Using og:image for video thumbnail:', ogImage.content.substring(0, 60));
        media.push({
          type: 'video',
          url: src || '',
          thumb_url: ogImage.content,
          duration: video.duration || 0
        });
        return media;
      }

      // Strategy 4: Look for any large image in the container that could be the thumbnail
      const containerImages = container.querySelectorAll('img[src*="cdninstagram"], img[src*="fbcdn"]');
      for (const img of containerImages) {
        const imgRect = img.getBoundingClientRect();
        if (imgRect.width > 200 && imgRect.height > 200) {
          log('Found large image as video thumbnail:', img.src.substring(0, 60));
          media.push({
            type: 'video',
            url: src || '',
            thumb_url: img.src,
            duration: video.duration || 0
          });
          return media;
        }
      }

      // Even without thumbnail, record that it's a video
      log('Video found but no thumbnail available');
      media.push({
        type: 'video',
        url: src || '',
        thumb_url: '',
        duration: video.duration || 0
      });
      return media;
    }

    // For images: Find the main content area by looking for the structure
    // Instagram posts have: header (avatar/username) -> main content (image) -> footer (likes/comments)
    const header = container.querySelector('header');

    if (!header) {
      log('No header found in container');
      return media;
    }

    // Get all images in the container
    const allImages = Array.from(container.querySelectorAll('img'));

    // Find images that come AFTER the header in document order and are NOT in the header
    const headerRect = header.getBoundingClientRect();

    for (const img of allImages) {
      // Skip if in header
      if (header.contains(img)) {
        continue;
      }

      const src = img.src;
      if (!src) continue;

      // Must be from Instagram/Facebook CDN
      if (!src.includes('cdninstagram') && !src.includes('fbcdn')) continue;

      // Skip profile pictures
      if (src.includes('150x150') || src.includes('44x44') || src.includes('32x32')) continue;
      if (img.alt?.toLowerCase().includes('profile picture')) continue;

      // Get image position
      const imgRect = img.getBoundingClientRect();

      // The main image should be BELOW the header (vertically)
      if (imgRect.top < headerRect.bottom) {
        continue;
      }

      // Skip tiny images
      if (imgRect.width < 100 || imgRect.height < 100) continue;

      // This should be the main post image - take the FIRST one we find after the header
      if (!seenUrls.has(src)) {
        log('Found main image after header:', src.substring(0, 60));
        seenUrls.add(src);
        media.push({
          type: 'image',
          url: src,
          thumb_url: src,
          alt_text: img.alt || ''
        });
        break; // Take only the first valid image
      }
    }

    log('Final media count:', media.length);
    return media;
  }

  /**
   * Extract engagement metrics
   */
  function extractMetrics(container) {
    const metrics = { likes: 0, comments: 0, views: 0 };
    const searchRoot = container && container !== document ? container : document;
    const text = searchRoot.innerText || '';

    // Likes
    const likeMatch = text.match(/(\d[\d,\.]*[KMB]?)\s*likes?/i);
    if (likeMatch) {
      metrics.likes = parseMetric(likeMatch[1]);
      log('Likes:', metrics.likes);
    }

    // Views
    const viewMatch = text.match(/(\d[\d,\.]*[KMB]?)\s*views?/i);
    if (viewMatch) {
      metrics.views = parseMetric(viewMatch[1]);
      log('Views:', metrics.views);
    }

    // Comments
    const commentMatch = text.match(/(\d[\d,\.]*[KMB]?)\s*comments?/i);
    if (commentMatch) {
      metrics.comments = parseMetric(commentMatch[1]);
      log('Comments:', metrics.comments);
    }

    return metrics;
  }

  /**
   * Parse metric string to number
   */
  function parseMetric(str) {
    if (!str) return 0;
    str = str.replace(/,/g, '');
    const match = str.match(/^([\d.]+)([KMB])?$/i);
    if (match) {
      const num = parseFloat(match[1]);
      const suffix = match[2]?.toUpperCase();
      if (suffix === 'K') return Math.round(num * 1000);
      if (suffix === 'M') return Math.round(num * 1000000);
      if (suffix === 'B') return Math.round(num * 1000000000);
      return num;
    }
    return parseInt(str, 10) || 0;
  }

  /**
   * Check if user is verified
   */
  function isVerified(container) {
    const searchRoot = container && container !== document ? container : document;

    // Look for verified badge
    const badge = searchRoot.querySelector('svg[aria-label*="Verified" i], [title*="Verified" i]');
    return !!badge;
  }

  /**
   * Extract hashtags and mentions
   */
  function extractEntities(text) {
    const entities = { hashtags: [], mentions: [] };
    if (!text) return entities;

    const hashtags = text.match(/#[a-zA-Z0-9_]+/g);
    if (hashtags) {
      entities.hashtags = hashtags.map(h => h.substring(1));
    }

    const mentions = text.match(/@[a-zA-Z0-9._]+/g);
    if (mentions) {
      entities.mentions = mentions.map(m => m.substring(1));
    }

    return entities;
  }

  /**
   * Extract complete post data
   */
  function extractPostData(container) {
    log('=== Starting extraction ===');
    log('Container:', container?.tagName || 'null');
    log('Container classes:', container?.className || 'none');
    log('Current URL:', window.location.href);

    // First try to get username (we'll need it for fallback ID)
    const username = extractUsername(container);
    log('Username:', username || 'unknown');

    let postUrl = extractPostUrl(container);
    log('Extracted post URL:', postUrl || 'null');

    let postId = postUrl ? extractPostIdFromUrl(postUrl) : null;
    log('Extracted post ID:', postId || 'null');

    // If no post URL/ID found, generate a fallback ID from username + timestamp
    if (!postId) {
      if (username) {
        // Generate unique ID from username and current time
        postId = `ig_${username}_${Date.now()}`;
        postUrl = `https://www.instagram.com/${username}/`;
        log('Generated fallback ID:', postId);
      } else {
        log('ERROR: Cannot generate ID - no username found');
        return null;
      }
    }

    if (recentlyCaptured.has(postId)) {
      log('Skipping duplicate:', postId);
      return null;
    }

    // Username already extracted above for fallback ID
    const avatar = extractAvatar(container);
    const caption = extractCaption(container);
    const media = extractMedia(container);
    const metrics = extractMetrics(container);
    const verified = isVerified(container);
    const entities = extractEntities(caption);

    // Determine post type
    let postType = 'post';
    if (postUrl.includes('/reel')) postType = 'reel';
    else if (postUrl.includes('/tv/')) postType = 'igtv';
    else if (media.some(m => m.type === 'video')) postType = 'video';

    const data = {
      tweet_id: postId,
      post_id: postId,
      post_type: postType,
      platform: 'instagram',

      user_handle: username,
      user_name: username,
      user_avatar: avatar,
      user_verified: verified,
      user_blue_verified: verified,
      user_business: false,
      user_government: false,

      text: caption,

      urls: [],
      hashtags: entities.hashtags,
      mentions: entities.mentions,

      reply_count: metrics.comments,
      retweet_count: 0,
      like_count: metrics.likes,
      view_count: metrics.views,
      bookmark_count: 0,

      quoted_tweet: null,
      quoted_text: '',
      quoted_author: '',

      media: media,
      card: null,

      is_reply: false,
      reply_to: null,

      original_created_at: null,
      captured_at: new Date().toISOString(),

      source_url: postUrl,
      source: 'browser'
    };

    log('=== Extraction complete ===');
    log('Post ID:', postId);
    log('Username:', username || '(none)');
    log('Caption:', caption ? caption.substring(0, 30) + '...' : '(none)');
    log('Media count:', media.length);
    log('Likes:', metrics.likes);

    return data;
  }

  /**
   * Capture a post
   */
  async function capturePost(container) {
    const postData = extractPostData(container);

    if (!postData) {
      return { success: false, error: 'Could not extract post data' };
    }

    recentlyCaptured.add(postData.post_id);
    setTimeout(() => recentlyCaptured.delete(postData.post_id), DUPLICATE_WINDOW_MS);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CAPTURE_INSTAGRAM',
        data: postData
      });

      if (response && response.success) {
        showToast('Post captured!');
        return { success: true, data: postData };
      } else {
        return { success: false, error: response?.error || 'Failed to save' };
      }
    } catch (error) {
      console.error('[IG Capture] Error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Show toast notification
   */
  function showToast(message) {
    const existing = document.querySelector('.rf-ig-capture-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'rf-ig-capture-toast';
    toast.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
      </svg>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('rf-ig-capture-toast-visible');
    });

    setTimeout(() => {
      toast.classList.remove('rf-ig-capture-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  /**
   * Check if element is a save button
   */
  function isSaveButton(element) {
    if (!element) return false;

    const checkLabel = (el) => {
      const label = el?.getAttribute?.('aria-label')?.toLowerCase() || '';
      return label.includes('save') || label.includes('guardar') || label.includes('bookmark');
    };

    if (checkLabel(element)) return true;
    if (element.tagName === 'svg' && checkLabel(element)) return true;

    const svg = element.querySelector?.('svg');
    if (svg && checkLabel(svg)) return true;

    const parent = element.closest?.('button, div[role="button"]');
    if (parent && checkLabel(parent)) return true;

    return false;
  }

  /**
   * Setup click listener
   */
  function setupClickListener() {
    document.addEventListener('click', (event) => {
      const target = event.target;

      if (isSaveButton(target) ||
          isSaveButton(target.closest('button')) ||
          isSaveButton(target.closest('div[role="button"]')) ||
          isSaveButton(target.closest('svg')?.parentElement)) {

        log('Save button clicked!');

        // Find the post container
        const container = findPostContainer(target);

        // Delay to allow Instagram to update UI
        setTimeout(() => {
          capturePost(container);
        }, 300);
      }
    }, true);
  }

  /**
   * Listen for messages
   */
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      log('Message received:', message.type);

      if (message.type === 'MANUAL_CAPTURE' || message.type === 'MANUAL_CAPTURE_INSTAGRAM') {
        capturePost(null).then(result => {
          sendResponse(result);
        });
        return true;
      }

      if (message.type === 'PING') {
        sendResponse({ success: true, platform: 'instagram', version: SCRIPT_VERSION });
        return true;
      }
    });
  }

  /**
   * Initialize
   */
  function init() {
    log('Initializing...');
    setupClickListener();
    setupMessageListener();
    log('Ready - click a save button to capture');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
