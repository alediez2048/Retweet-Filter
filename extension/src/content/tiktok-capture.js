/**
 * Content script for capturing saved/favorited videos on TikTok
 * Detects when user bookmarks/favorites a video and captures it
 * v1.0.0
 */

(function () {
  'use strict';

  const SCRIPT_VERSION = '1.0.0';
  const DEBUG = true;

  function log(...args) {
    if (DEBUG) console.log('[TikTok Capture]', ...args);
  }

  // Prevent duplicate injection
  if (window.__tiktokFilterInjected === SCRIPT_VERSION) {
    log('Already injected, skipping');
    return;
  }
  window.__tiktokFilterInjected = SCRIPT_VERSION;
  log('v' + SCRIPT_VERSION + ' loading...');

  // Track recently captured video IDs to prevent duplicates
  const recentlyCaptured = new Set();
  const DUPLICATE_WINDOW_MS = 5000;

  /**
   * Extract video ID from URL
   */
  function extractVideoIdFromUrl(url) {
    if (!url) return null;
    // Pattern: /@username/video/1234567890 or /video/1234567890
    const match = url.match(/\/video\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract username from URL
   */
  function extractUsernameFromUrl(url) {
    if (!url) return null;
    const match = url.match(/\/@([^\/\?]+)/);
    return match ? match[1] : null;
  }

  /**
   * Find the video container from a clicked element
   */
  function findVideoContainer(clickedElement) {
    if (!clickedElement) {
      log('No clicked element provided');
      return null;
    }

    log('Finding container from:', clickedElement.tagName, clickedElement.className);

    // Strategy 1: Look for common TikTok video container patterns
    let container = clickedElement.closest('[data-e2e="recommend-list-item-container"]');
    if (container) {
      log('Found recommend-list-item container');
      return container;
    }

    // Strategy 2: Video player container
    container = clickedElement.closest('[data-e2e="browse-video"]');
    if (container) {
      log('Found browse-video container');
      return container;
    }

    // Strategy 3: For You page video wrapper
    container = clickedElement.closest('[class*="DivItemContainer"]');
    if (container) {
      log('Found DivItemContainer');
      return container;
    }

    // Strategy 4: Video detail page
    container = clickedElement.closest('[class*="DivBrowserModeContainer"]');
    if (container) {
      log('Found browser mode container');
      return container;
    }

    // Strategy 5: Walk up to find video element
    let el = clickedElement.parentElement;
    let depth = 0;
    while (el && depth < 15) {
      const hasVideo = el.querySelector('video');
      const hasUserLink = el.querySelector('a[href*="/@"]');

      if (hasVideo && hasUserLink) {
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
   * Extract video URL from container or page
   */
  function extractVideoUrl(container) {
    // First check the page URL
    const pageUrl = window.location.href;
    if (pageUrl.match(/\/video\/\d+/)) {
      log('Video URL from page:', pageUrl);
      return pageUrl.split('?')[0];
    }

    // Look for video links in the container
    if (container && container !== document) {
      const videoLinks = container.querySelectorAll('a[href*="/video/"]');
      for (const link of videoLinks) {
        const href = link.getAttribute('href');
        if (href && href.match(/\/video\/\d+/)) {
          const fullUrl = href.startsWith('http') ? href : `https://www.tiktok.com${href}`;
          log('Video URL from container link:', fullUrl);
          return fullUrl;
        }
      }
    }

    // Try meta tags
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl && ogUrl.content && ogUrl.content.includes('/video/')) {
      log('Video URL from og:url:', ogUrl.content);
      return ogUrl.content.split('?')[0];
    }

    // Try canonical link
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href && canonical.href.includes('/video/')) {
      log('Video URL from canonical:', canonical.href);
      return canonical.href.split('?')[0];
    }

    log('ERROR: No video URL found');
    return null;
  }

  /**
   * Extract username from container
   */
  function extractUsername(container) {
    log('Extracting username...');

    const searchRoot = container && container !== document ? container : document;

    // Strategy 1: Look for user profile links with @username
    const userLinks = searchRoot.querySelectorAll('a[href^="/@"]');
    for (const link of userLinks) {
      const href = link.getAttribute('href');
      const match = href?.match(/^\/@([a-zA-Z0-9._]+)/);
      if (match) {
        log('Username from @link:', match[1]);
        return match[1];
      }
    }

    // Strategy 2: data-e2e attribute for author
    const authorEl = searchRoot.querySelector('[data-e2e="video-author-uniqueid"]');
    if (authorEl) {
      const username = authorEl.textContent?.trim();
      if (username) {
        log('Username from data-e2e:', username);
        return username;
      }
    }

    // Strategy 3: Look for unique ID elements
    const uniqueIdEl = searchRoot.querySelector('[class*="AuthorUniqueId"], [class*="uniqueId"]');
    if (uniqueIdEl) {
      const username = uniqueIdEl.textContent?.trim();
      if (username) {
        log('Username from uniqueId class:', username);
        return username;
      }
    }

    // Strategy 4: From page URL
    const urlUsername = extractUsernameFromUrl(window.location.href);
    if (urlUsername) {
      log('Username from URL:', urlUsername);
      return urlUsername;
    }

    // Strategy 5: From og:url meta tag
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl && ogUrl.content) {
      const match = ogUrl.content.match(/\/@([^\/\?]+)/);
      if (match) {
        log('Username from og:url:', match[1]);
        return match[1];
      }
    }

    log('No username found');
    return '';
  }

  /**
   * Extract display name
   */
  function extractDisplayName(container) {
    const searchRoot = container && container !== document ? container : document;

    // Strategy 1: data-e2e for author nickname
    const nicknameEl = searchRoot.querySelector('[data-e2e="video-author-nickname"]');
    if (nicknameEl) {
      const name = nicknameEl.textContent?.trim();
      if (name) {
        log('Display name from data-e2e:', name);
        return name;
      }
    }

    // Strategy 2: Look for nickname class
    const nicknameClass = searchRoot.querySelector('[class*="AuthorNickname"], [class*="nickname"]');
    if (nicknameClass) {
      const name = nicknameClass.textContent?.trim();
      if (name) {
        log('Display name from nickname class:', name);
        return name;
      }
    }

    // Strategy 3: og:title often has the format "username on TikTok" or "video by username"
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) {
      // Try to extract name before "on TikTok" or similar
      const match = ogTitle.content.match(/^(.+?)\s+on\s+TikTok/i);
      if (match) {
        log('Display name from og:title:', match[1]);
        return match[1];
      }
    }

    return '';
  }

  /**
   * Extract avatar URL
   */
  function extractAvatar(container) {
    const searchRoot = container && container !== document ? container : document;

    // Strategy 1: Look for profile picture in author area
    const avatarImg = searchRoot.querySelector('[data-e2e="video-avatar"] img, [class*="Avatar"] img, [class*="avatar"] img');
    if (avatarImg && avatarImg.src) {
      log('Avatar from avatar element:', avatarImg.src.substring(0, 50) + '...');
      return avatarImg.src;
    }

    // Strategy 2: Look for small circular images near user info
    const allImages = searchRoot.querySelectorAll('img');
    for (const img of allImages) {
      // TikTok avatars are typically small and circular
      const style = window.getComputedStyle(img);
      const isCircular = style.borderRadius === '50%' || img.className.includes('circle');
      const isSmall = (img.width && img.width < 100) || img.src.includes('100x100');

      if ((isCircular || isSmall) && img.src && img.src.includes('tiktokcdn')) {
        log('Avatar from image search:', img.src.substring(0, 50) + '...');
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

    // Strategy 1: data-e2e for video description
    const descEl = searchRoot.querySelector('[data-e2e="video-desc"], [data-e2e="browse-video-desc"]');
    if (descEl) {
      const text = descEl.textContent?.trim();
      if (text) {
        log('Caption from data-e2e:', text.substring(0, 50) + '...');
        return text;
      }
    }

    // Strategy 2: Look for description class
    const descClass = searchRoot.querySelector('[class*="DivVideoDesc"], [class*="VideoDesc"], [class*="video-desc"]');
    if (descClass) {
      const text = descClass.textContent?.trim();
      if (text) {
        log('Caption from desc class:', text.substring(0, 50) + '...');
        return text;
      }
    }

    // Strategy 3: From meta description
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc && ogDesc.content) {
      log('Caption from og:description:', ogDesc.content.substring(0, 50) + '...');
      return ogDesc.content;
    }

    // Strategy 4: From meta name description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && metaDesc.content) {
      log('Caption from meta description:', metaDesc.content.substring(0, 50) + '...');
      return metaDesc.content;
    }

    log('No caption found');
    return '';
  }

  /**
   * Try to capture a frame from video as data URL
   */
  function captureVideoFrame(video) {
    try {
      if (!video || video.readyState < 2) return null;

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 568;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch (e) {
      log('Could not capture video frame:', e.message);
      return null;
    }
  }

  /**
   * Extract video thumbnail
   */
  function extractThumbnail(container) {
    log('=== Thumbnail extraction ===');

    const searchRoot = container && container !== document ? container : document;

    // Strategy 1: Find the video element and get poster
    const videos = searchRoot.querySelectorAll('video');
    for (const video of videos) {
      if (video.poster) {
        log('Thumbnail from video poster:', video.poster.substring(0, 60));
        return { thumb_url: video.poster, duration: video.duration || 0 };
      }
    }

    // Strategy 2: Capture frame from playing video
    const allVideos = document.querySelectorAll('video');
    let bestVideo = null;
    let bestVideoSize = 0;

    for (const video of allVideos) {
      const rect = video.getBoundingClientRect();
      const size = rect.width * rect.height;
      const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

      if (isVisible && size > bestVideoSize) {
        bestVideoSize = size;
        bestVideo = video;
      }
    }

    if (bestVideo) {
      if (bestVideo.poster) {
        log('Thumbnail from best video poster');
        return { thumb_url: bestVideo.poster, duration: bestVideo.duration || 0 };
      }

      const frameData = captureVideoFrame(bestVideo);
      if (frameData) {
        log('Captured video frame as thumbnail');
        return { thumb_url: frameData, duration: bestVideo.duration || 0 };
      }
    }

    // Strategy 3: og:image meta tag
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage && ogImage.content) {
      log('Thumbnail from og:image:', ogImage.content.substring(0, 60));
      return { thumb_url: ogImage.content, duration: 0 };
    }

    // Strategy 4: Look for cover images
    const coverImg = searchRoot.querySelector('[class*="DivPlayerContainer"] img, [class*="video-card"] img');
    if (coverImg && coverImg.src) {
      log('Thumbnail from cover image');
      return { thumb_url: coverImg.src, duration: 0 };
    }

    log('No thumbnail found');
    return { thumb_url: '', duration: 0 };
  }

  /**
   * Parse metric string to number (handles K, M, B suffixes)
   */
  function parseMetric(str) {
    if (!str) return 0;
    str = String(str).replace(/,/g, '').trim();
    const match = str.match(/^([\d.]+)([KMB])?$/i);
    if (match) {
      const num = parseFloat(match[1]);
      const suffix = match[2]?.toUpperCase();
      if (suffix === 'K') return Math.round(num * 1000);
      if (suffix === 'M') return Math.round(num * 1000000);
      if (suffix === 'B') return Math.round(num * 1000000000);
      return Math.round(num);
    }
    return parseInt(str, 10) || 0;
  }

  /**
   * Extract engagement metrics
   */
  function extractMetrics(container) {
    const metrics = { likes: 0, comments: 0, shares: 0, views: 0 };
    const searchRoot = container && container !== document ? container : document;

    // Strategy 1: data-e2e attributes for specific metrics
    const likeEl = searchRoot.querySelector('[data-e2e="like-count"], [data-e2e="browse-like-count"]');
    if (likeEl) {
      metrics.likes = parseMetric(likeEl.textContent);
      log('Likes from data-e2e:', metrics.likes);
    }

    const commentEl = searchRoot.querySelector('[data-e2e="comment-count"], [data-e2e="browse-comment-count"]');
    if (commentEl) {
      metrics.comments = parseMetric(commentEl.textContent);
      log('Comments from data-e2e:', metrics.comments);
    }

    const shareEl = searchRoot.querySelector('[data-e2e="share-count"]');
    if (shareEl) {
      metrics.shares = parseMetric(shareEl.textContent);
      log('Shares from data-e2e:', metrics.shares);
    }

    // Strategy 2: Look for action buttons with counts
    const actionButtons = searchRoot.querySelectorAll('button[class*="Button"], [class*="ActionItem"]');
    for (const btn of actionButtons) {
      const text = btn.textContent?.trim();
      const count = parseMetric(text);
      if (count > 0) {
        // Try to determine which metric based on nearby icons or aria-labels
        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
        const btnText = btn.innerText?.toLowerCase() || '';

        if (ariaLabel.includes('like') || btnText.includes('like')) {
          if (metrics.likes === 0) metrics.likes = count;
        } else if (ariaLabel.includes('comment') || btnText.includes('comment')) {
          if (metrics.comments === 0) metrics.comments = count;
        } else if (ariaLabel.includes('share') || btnText.includes('share')) {
          if (metrics.shares === 0) metrics.shares = count;
        }
      }
    }

    // Strategy 3: From strong elements (TikTok often wraps counts in <strong>)
    const strongEls = searchRoot.querySelectorAll('strong[data-e2e]');
    for (const el of strongEls) {
      const dataE2e = el.getAttribute('data-e2e');
      const count = parseMetric(el.textContent);

      if (dataE2e?.includes('like') && metrics.likes === 0) {
        metrics.likes = count;
      } else if (dataE2e?.includes('comment') && metrics.comments === 0) {
        metrics.comments = count;
      } else if (dataE2e?.includes('share') && metrics.shares === 0) {
        metrics.shares = count;
      }
    }

    // Views are often in video details or og:description
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc && ogDesc.content) {
      const viewMatch = ogDesc.content.match(/(\d[\d,\.]*[KMB]?)\s*views?/i);
      if (viewMatch) {
        metrics.views = parseMetric(viewMatch[1]);
        log('Views from og:description:', metrics.views);
      }
    }

    return metrics;
  }

  /**
   * Check if user is verified
   */
  function isVerified(container) {
    const searchRoot = container && container !== document ? container : document;

    // Look for verified badge
    const badge = searchRoot.querySelector('svg[data-e2e="verify-badge"], [class*="Verified"], [class*="verified-badge"]');
    return !!badge;
  }

  /**
   * Extract hashtags and mentions
   */
  function extractEntities(text) {
    const entities = { hashtags: [], mentions: [] };
    if (!text) return entities;

    const hashtags = text.match(/#[a-zA-Z0-9_\u4e00-\u9fff]+/g);
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
   * Extract complete video data
   */
  function extractVideoData(container) {
    log('=== Starting extraction ===');
    log('Container:', container?.tagName || 'null');
    log('Current URL:', window.location.href);

    // Get video URL first
    let videoUrl = extractVideoUrl(container);
    log('Extracted video URL:', videoUrl || 'null');

    let videoId = videoUrl ? extractVideoIdFromUrl(videoUrl) : null;
    log('Extracted video ID:', videoId || 'null');

    // Get username for fallback ID
    const username = extractUsername(container);
    log('Username:', username || 'unknown');

    // If no video URL/ID found, generate a fallback ID
    if (!videoId) {
      if (username) {
        videoId = `tt_${username}_${Date.now()}`;
        videoUrl = `https://www.tiktok.com/@${username}`;
        log('Generated fallback ID:', videoId);
      } else {
        log('ERROR: Cannot generate ID - no username found');
        return null;
      }
    }

    if (recentlyCaptured.has(videoId)) {
      log('Skipping duplicate:', videoId);
      return null;
    }

    const displayName = extractDisplayName(container) || username;
    const avatar = extractAvatar(container);
    const caption = extractCaption(container);
    const { thumb_url, duration } = extractThumbnail(container);
    const metrics = extractMetrics(container);
    const verified = isVerified(container);
    const entities = extractEntities(caption);

    const data = {
      tweet_id: videoId,
      post_id: videoId,
      post_type: 'video',
      platform: 'tiktok',

      user_handle: username,
      user_name: displayName,
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
      retweet_count: metrics.shares,
      like_count: metrics.likes,
      view_count: metrics.views,
      bookmark_count: 0,

      quoted_tweet: null,
      quoted_text: '',
      quoted_author: '',

      media: [{
        type: 'video',
        url: '',
        thumb_url: thumb_url,
        alt_text: caption.substring(0, 100),
        duration: duration
      }],
      card: null,

      is_reply: false,
      reply_to: null,

      original_created_at: null,
      captured_at: new Date().toISOString(),

      source_url: videoUrl,
      source: 'browser'
    };

    log('=== Extraction complete ===');
    log('Video ID:', videoId);
    log('Username:', username || '(none)');
    log('Caption:', caption ? caption.substring(0, 30) + '...' : '(none)');
    log('Thumbnail:', thumb_url ? 'Yes' : 'No');
    log('Likes:', metrics.likes);
    log('Comments:', metrics.comments);
    log('Shares:', metrics.shares);

    return data;
  }

  /**
   * Capture a video
   */
  async function captureVideo(container) {
    const videoData = extractVideoData(container);

    if (!videoData) {
      return { success: false, error: 'Could not extract video data' };
    }

    recentlyCaptured.add(videoData.post_id);
    setTimeout(() => recentlyCaptured.delete(videoData.post_id), DUPLICATE_WINDOW_MS);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CAPTURE_TIKTOK',
        data: videoData
      });

      if (response && response.success) {
        showToast('Video captured!');
        return { success: true, data: videoData };
      } else {
        return { success: false, error: response?.error || 'Failed to save' };
      }
    } catch (error) {
      console.error('[TikTok Capture] Error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Show toast notification
   */
  function showToast(message) {
    const existing = document.querySelector('.rf-tt-capture-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'rf-tt-capture-toast';
    toast.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
      </svg>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('rf-tt-capture-toast-visible');
    });

    setTimeout(() => {
      toast.classList.remove('rf-tt-capture-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  /**
   * Check if element is a like button
   */
  function isLikeButton(element) {
    if (!element) return false;

    // Check data-e2e attribute
    if (element.getAttribute('data-e2e') === 'like-icon') return true;

    // Check aria-label
    const label = element.getAttribute('aria-label');
    if (label && label.toLowerCase().includes('like')) return true;

    return false;
  }

  /**
   * Check if element is a favorite/save button
   */
  function isFavoriteButton(element) {
    if (!element) return false;

    const checkLabel = (el) => {
      const label = el?.getAttribute?.('aria-label')?.toLowerCase() || '';
      const dataE2e = el?.getAttribute?.('data-e2e')?.toLowerCase() || '';
      return label.includes('favorite') ||
        label.includes('save') ||
        label.includes('bookmark') ||
        label.includes('collect') ||
        dataE2e.includes('favorite') ||
        dataE2e.includes('undefined-icon'); // TikTok sometimes uses this for save
    };

    if (checkLabel(element)) return true;
    if (element.tagName === 'svg' && checkLabel(element)) return true;

    const svg = element.querySelector?.('svg');
    if (svg && checkLabel(svg)) return true;

    const parent = element.closest?.('button, div[role="button"], [data-e2e*="favorite"], [data-e2e*="collect"]');
    if (parent && checkLabel(parent)) return true;

    // Check for bookmark icon path (common TikTok bookmark SVG)
    const path = element.closest('svg')?.querySelector('path');
    if (path) {
      const d = path.getAttribute('d');
      // TikTok bookmark icon has a distinctive path
      if (d && (d.includes('M5 ') || d.includes('bookmark'))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Setup click listener
   */
  function setupClickListener() {
    document.addEventListener('click', (event) => {
      const target = event.target;

      if (isFavoriteButton(target) ||
        isFavoriteButton(target.closest('button')) ||
        isFavoriteButton(target.closest('div[role="button"]')) ||
        isFavoriteButton(target.closest('svg')?.parentElement) ||
        isLikeButton(target) ||
        isLikeButton(target.closest('button')) ||
        isLikeButton(target.closest('div[role="button"]')) ||
        isLikeButton(target.closest('span[data-e2e="like-icon"]'))) {

        log('Favorite/Like button clicked!');

        // Find the video container
        const container = findVideoContainer(target);

        // Delay to allow TikTok to update UI
        setTimeout(() => {
          captureVideo(container);
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

      if (message.type === 'MANUAL_CAPTURE' || message.type === 'MANUAL_CAPTURE_TIKTOK') {
        captureVideo(null).then(result => {
          sendResponse(result);
        });
        return true;
      }

      if (message.type === 'PING') {
        sendResponse({ success: true, platform: 'tiktok', version: SCRIPT_VERSION });
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
    log('Ready - click a favorite/save button to capture');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
