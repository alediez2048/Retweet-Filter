/**
 * Content script for capturing saved posts on Instagram
 * Detects when user bookmarks/saves a post and captures it
 */

(function() {
  'use strict';

  const SCRIPT_VERSION = '1.3.1';

  // Prevent duplicate injection
  if (window.__instagramFilterInjected === SCRIPT_VERSION) {
    console.log('[IG Capture] Already injected, skipping');
    return;
  }
  window.__instagramFilterInjected = SCRIPT_VERSION;
  console.log('[IG Capture] v' + SCRIPT_VERSION + ' loading...');

  // Track recently captured post IDs to prevent duplicates
  const recentlyCaptured = new Set();
  const DUPLICATE_WINDOW_MS = 5000;

  /**
   * Extract post ID from URL
   */
  function extractPostIdFromUrl(url) {
    if (!url) url = window.location.href;
    const match = url.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    return match ? match[2] : null;
  }

  /**
   * Get the current post URL - prioritize the page URL for single post pages
   */
  function getCurrentPostUrl() {
    const url = window.location.href;
    // If we're on a post/reel page, use that URL
    if (url.match(/\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/)) {
      return url.split('?')[0];
    }
    return url;
  }

  /**
   * Extract username from the page - multiple strategies
   */
  function extractUsername() {
    // Strategy 1: From URL path (works on user profile pages)
    const pathMatch = window.location.pathname.match(/^\/([a-zA-Z0-9._]+)\/?$/);
    if (pathMatch && !['p', 'reel', 'reels', 'tv', 'explore', 'direct', 'accounts'].includes(pathMatch[1])) {
      return pathMatch[1];
    }

    // Strategy 2: From meta tags
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) {
      const match = ogUrl.content?.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
      if (match && !['p', 'reel', 'reels', 'tv'].includes(match[1])) {
        return match[1];
      }
    }

    // Strategy 3: From the post header - look for the first link that's a username
    const article = document.querySelector('article');
    if (article) {
      // Look in header first
      const header = article.querySelector('header');
      if (header) {
        const links = header.querySelectorAll('a[href^="/"]');
        for (const link of links) {
          const href = link.getAttribute('href');
          const match = href?.match(/^\/([a-zA-Z0-9._]+)\/?$/);
          if (match && !['p', 'reel', 'reels', 'tv', 'explore'].includes(match[1])) {
            return match[1];
          }
        }
      }
    }

    // Strategy 4: From any visible username link with specific patterns
    const allLinks = document.querySelectorAll('a[href^="/"][role="link"]');
    for (const link of allLinks) {
      const href = link.getAttribute('href');
      const match = href?.match(/^\/([a-zA-Z0-9._]+)\/?$/);
      if (match && !['p', 'reel', 'reels', 'tv', 'explore', 'direct', 'accounts', 'stories'].includes(match[1])) {
        // Verify this looks like a username (has text content)
        const text = link.textContent?.trim();
        if (text && text.length < 50 && !text.includes(' ')) {
          return match[1];
        }
      }
    }

    // Strategy 5: Look for username in the page title
    const title = document.title;
    const titleMatch = title.match(/@([a-zA-Z0-9._]+)/);
    if (titleMatch) {
      return titleMatch[1];
    }

    return '';
  }

  /**
   * Extract display name (different from username)
   */
  function extractDisplayName(username) {
    // Try to find the display name near the username
    const article = document.querySelector('article');
    if (!article) return username;

    const header = article.querySelector('header');
    if (!header) return username;

    // Look for spans that might contain the display name
    const spans = header.querySelectorAll('span');
    for (const span of spans) {
      const text = span.textContent?.trim();
      // Display name is usually not the username and doesn't contain special chars
      if (text && text.length > 0 && text.length < 50 &&
          text !== username && !text.startsWith('@') &&
          !text.includes('Verified') && !text.includes('Follow')) {
        return text;
      }
    }

    return username;
  }

  /**
   * Extract avatar URL
   */
  function extractAvatar() {
    // Look for profile picture in the header
    const article = document.querySelector('article');
    if (article) {
      const header = article.querySelector('header');
      if (header) {
        const img = header.querySelector('img[alt*="profile" i], img[src*="150x150"], img[src*="cdninstagram"]');
        if (img && img.src) {
          return img.src;
        }
        // Fallback: first small image in header (likely avatar)
        const firstImg = header.querySelector('img');
        if (firstImg && firstImg.src && firstImg.width < 100) {
          return firstImg.src;
        }
      }
    }

    // Look for any profile-like image
    const profileImg = document.querySelector('img[alt*="profile picture" i]');
    if (profileImg) {
      return profileImg.src;
    }

    return '';
  }

  /**
   * Extract caption/description text
   */
  function extractCaption() {
    const article = document.querySelector('article');
    if (!article) return '';

    // Strategy 1: Look for the main caption container
    // Instagram typically has caption in a specific structure
    const captionSelectors = [
      'h1', // Reels often use h1 for caption
      'div[style*="display"] > span',
      'ul li span[dir="auto"]',
      'span[dir="auto"]'
    ];

    for (const selector of captionSelectors) {
      const elements = article.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent?.trim();
        // Caption should be substantial and not be UI text
        if (text && text.length > 5 &&
            !text.includes('likes') &&
            !text.includes('views') &&
            !text.includes('comments') &&
            !text.includes('Follow') &&
            !text.includes('Verified') &&
            !text.match(/^\d+[KMB]?\s*(likes?|views?|comments?)/i)) {
          // Check this isn't just a username
          if (text.length > 20 || text.includes(' ') || text.includes('#')) {
            console.log('[IG Capture] Found caption:', text.substring(0, 50));
            return text;
          }
        }
      }
    }

    // Strategy 2: Look in meta tags
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc && ogDesc.content) {
      const desc = ogDesc.content;
      // Instagram meta descriptions often have format: "X likes, Y comments - username: caption"
      const captionMatch = desc.match(/:\s*[""]?(.+?)[""]?\s*$/);
      if (captionMatch) {
        return captionMatch[1];
      }
      return desc;
    }

    return '';
  }

  /**
   * Extract media (images/videos) from the current post only
   */
  function extractMedia() {
    const media = [];
    const seenUrls = new Set();
    const article = document.querySelector('article');

    if (!article) return media;

    // Find the main media container (not the header/avatar area)
    // Look for images in the post content area, excluding header
    const header = article.querySelector('header');

    // Get all images in article
    const images = article.querySelectorAll('img');
    for (const img of images) {
      // Skip if image is inside header (avatar)
      if (header && header.contains(img)) continue;

      const src = img.src;
      if (!src || seenUrls.has(src)) continue;

      // Skip small images (icons, avatars)
      if (img.width < 100 && img.height < 100) continue;

      // Skip profile pictures
      if (src.includes('150x150') || src.includes('profile')) continue;

      // Must be from Instagram CDN
      if (!src.includes('cdninstagram') && !src.includes('fbcdn')) continue;

      seenUrls.add(src);
      media.push({
        type: 'image',
        url: src,
        thumb_url: src,
        alt_text: img.alt || ''
      });
    }

    // Find videos
    const videos = article.querySelectorAll('video');
    for (const video of videos) {
      const poster = video.poster;
      const src = video.src || video.querySelector('source')?.src;

      if (poster && !seenUrls.has(poster)) {
        seenUrls.add(poster);
        media.push({
          type: 'video',
          url: src || '',
          thumb_url: poster,
          duration: video.duration || 0
        });
      }
    }

    // Limit to first 4 media items (carousel limit)
    return media.slice(0, 4);
  }

  /**
   * Extract engagement metrics
   */
  function extractMetrics() {
    const metrics = { likes: 0, comments: 0, views: 0 };

    // Look for like count
    const likePatterns = [
      /(\d[\d,.]*[KMB]?)\s*likes?/i,
      /(\d[\d,.]*[KMB]?)\s*others?/i
    ];

    // Look for view count (reels/videos)
    const viewPatterns = [
      /(\d[\d,.]*[KMB]?)\s*views?/i,
      /(\d[\d,.]*[KMB]?)\s*plays?/i
    ];

    const textContent = document.body.innerText;

    for (const pattern of likePatterns) {
      const match = textContent.match(pattern);
      if (match) {
        metrics.likes = parseMetricValue(match[1]);
        break;
      }
    }

    for (const pattern of viewPatterns) {
      const match = textContent.match(pattern);
      if (match) {
        metrics.views = parseMetricValue(match[1]);
        break;
      }
    }

    return metrics;
  }

  /**
   * Parse metric value like "1.2K" or "1,234" to number
   */
  function parseMetricValue(str) {
    if (!str) return 0;
    str = str.replace(/,/g, '');
    const multipliers = { 'K': 1000, 'M': 1000000, 'B': 1000000000 };
    const match = str.match(/^([\d.]+)([KMB])?$/i);
    if (match) {
      const num = parseFloat(match[1]);
      const suffix = match[2]?.toUpperCase();
      return suffix ? Math.round(num * multipliers[suffix]) : num;
    }
    return parseInt(str, 10) || 0;
  }

  /**
   * Check if user is verified
   */
  function isVerified() {
    const article = document.querySelector('article');
    if (!article) return false;

    const header = article.querySelector('header');
    if (!header) return false;

    // Look for verified badge SVG
    const verifiedSvg = header.querySelector('svg[aria-label*="Verified" i]');
    if (verifiedSvg) return true;

    // Look for verified text
    const spans = header.querySelectorAll('span');
    for (const span of spans) {
      if (span.textContent?.includes('Verified')) return true;
    }

    return false;
  }

  /**
   * Extract hashtags and mentions from caption
   */
  function extractEntities(caption) {
    const entities = { hashtags: [], mentions: [] };
    if (!caption) return entities;

    const hashtags = caption.match(/#[a-zA-Z0-9_]+/g);
    if (hashtags) {
      entities.hashtags = hashtags.map(h => h.substring(1));
    }

    const mentions = caption.match(/@[a-zA-Z0-9._]+/g);
    if (mentions) {
      entities.mentions = mentions.map(m => m.substring(1));
    }

    return entities;
  }

  /**
   * Extract complete post data
   */
  function extractPostData() {
    const postUrl = getCurrentPostUrl();
    const postId = extractPostIdFromUrl(postUrl);

    if (!postId) {
      console.log('[IG Capture] No post ID found in URL');
      return null;
    }

    // Check for recent duplicate
    if (recentlyCaptured.has(postId)) {
      console.log('[IG Capture] Skipping duplicate:', postId);
      return null;
    }

    const username = extractUsername();
    const displayName = extractDisplayName(username);
    const avatar = extractAvatar();
    const caption = extractCaption();
    const media = extractMedia();
    const metrics = extractMetrics();
    const verified = isVerified();
    const entities = extractEntities(caption);

    // Determine post type
    let postType = 'post';
    if (postUrl.includes('/reel')) {
      postType = 'reel';
    } else if (postUrl.includes('/tv/')) {
      postType = 'igtv';
    } else if (media.some(m => m.type === 'video')) {
      postType = 'video';
    }

    const data = {
      tweet_id: postId,
      post_id: postId,
      post_type: postType,
      platform: 'instagram',

      user_handle: username,
      user_name: displayName || username,
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

    console.log('[IG Capture] Extracted data:', {
      postId,
      username,
      displayName,
      hasAvatar: !!avatar,
      captionLength: caption.length,
      mediaCount: media.length,
      postType
    });

    return data;
  }

  /**
   * Capture the current post
   */
  async function captureCurrentPost() {
    const postData = extractPostData();

    if (!postData) {
      console.log('[IG Capture] No post data to capture');
      return { success: false, error: 'Could not extract post data' };
    }

    // Mark as recently captured
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
      console.error('[IG Capture] Error sending to background:', error);
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

    const button = element.closest?.('button');
    if (button && checkLabel(button)) return true;

    return false;
  }

  /**
   * Setup click listener for save button
   */
  function setupClickListener() {
    document.addEventListener('click', (event) => {
      const target = event.target;

      // Check if save button clicked
      if (isSaveButton(target) ||
          isSaveButton(target.closest('button')) ||
          isSaveButton(target.closest('div[role="button"]')) ||
          isSaveButton(target.closest('svg')?.parentElement)) {

        console.log('[IG Capture] Save button clicked');

        // Delay to allow Instagram to update UI
        setTimeout(() => {
          captureCurrentPost();
        }, 200);
      }
    }, true);
  }

  /**
   * Listen for messages from popup
   */
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[IG Capture] Received message:', message.type);

      if (message.type === 'MANUAL_CAPTURE' || message.type === 'MANUAL_CAPTURE_INSTAGRAM') {
        captureCurrentPost().then(result => {
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
    console.log('[IG Capture] Initializing...');
    setupClickListener();
    setupMessageListener();
    console.log('[IG Capture] Ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
