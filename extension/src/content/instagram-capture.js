/**
 * Content script for capturing saved posts on Instagram
 * Detects when user bookmarks/saves a post and captures it
 */

(function() {
  'use strict';

  // Version for detecting updates
  const SCRIPT_VERSION = '1.3.0';

  // Avoid duplicate injection
  if (window.__instagramFilterInjected === SCRIPT_VERSION) {
    console.log('[Instagram Filter] Already injected (same version), skipping');
    return;
  }

  if (window.__instagramFilterInjected) {
    console.log('[Instagram Filter] Detected version change, reinitializing...');
  }

  window.__instagramFilterInjected = SCRIPT_VERSION;
  console.log('[Instagram Filter] Content script v' + SCRIPT_VERSION + ' loading...');

  const CAPTURE_DEBOUNCE_MS = 300;
  const PROCESSED_MARKER = 'data-rf-ig-processed';

  let captureQueue = [];
  let queueTimeout = null;
  let lastHoveredPost = null;
  let lastMousePosition = { x: 0, y: 0 };

  /**
   * Parse metric text (e.g., "1,234 likes" or "1.2K") to number
   * @param {string} text - Metric text
   * @returns {number} Parsed number
   */
  function parseMetric(text) {
    if (!text) return 0;
    text = text.trim().replace(/,/g, '').replace(/likes?|comments?|views?/gi, '').trim();

    const multipliers = { 'K': 1000, 'M': 1000000, 'B': 1000000000 };
    const match = text.match(/^([\d.]+)\s*([KMB])?$/i);

    if (match) {
      const num = parseFloat(match[1]);
      const suffix = match[2]?.toUpperCase();
      return suffix ? Math.round(num * multipliers[suffix]) : num;
    }

    return parseInt(text, 10) || 0;
  }

  /**
   * Extract post ID from Instagram URL
   * @param {string} url - Instagram URL
   * @returns {string|null} Post ID or null
   */
  function extractPostId(url) {
    if (!url) return null;
    // Match /p/{id}/, /reel/{id}/, /tv/{id}/
    const match = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    return match ? match[2] : null;
  }

  /**
   * Get current post URL from page or article
   * @param {Element} postElement - Post article element
   * @returns {string} Post URL
   */
  function getPostUrl(postElement) {
    // Check current URL first if on a post page
    const currentUrl = window.location.href;
    if (currentUrl.match(/\/(p|reel|tv)\/[A-Za-z0-9_-]+/)) {
      return currentUrl.split('?')[0];
    }

    // Find link within the post
    const timeLink = postElement?.querySelector('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]');
    if (timeLink) {
      return 'https://www.instagram.com' + timeLink.getAttribute('href').split('?')[0];
    }

    return currentUrl;
  }

  /**
   * Extract author information from post element
   * @param {Element} postElement - Post article element
   * @returns {Object} Author data
   */
  function extractAuthorInfo(postElement) {
    const author = {
      handle: '',
      name: '',
      avatar_url: '',
      is_verified: false
    };

    try {
      // Strategy 1: Find username from header link
      const headerSelectors = [
        'header a[href^="/"][role="link"]',
        'header a[href^="/"]',
        'a[href^="/"][role="link"] span',
        'article header a'
      ];

      for (const selector of headerSelectors) {
        const headerLinks = postElement?.querySelectorAll(selector);
        if (headerLinks) {
          for (const link of headerLinks) {
            const href = link.getAttribute('href');
            if (href && href.match(/^\/[a-zA-Z0-9._]+\/?$/) && !href.includes('/p/') && !href.includes('/explore/')) {
              author.handle = href.replace(/\//g, '');

              // Try to get display name
              const nameSpan = link.querySelector('span') || link;
              const text = nameSpan.textContent?.trim();
              if (text && text.length < 50) {
                author.name = text;
              }
              break;
            }
          }
        }
        if (author.handle) break;
      }

      // Strategy 2: Find from username in caption or nearby
      if (!author.handle) {
        const usernameLinks = postElement?.querySelectorAll('a[href^="/"]');
        for (const link of usernameLinks) {
          const href = link.getAttribute('href');
          if (href && href.match(/^\/[a-zA-Z0-9._]+\/?$/) &&
              !href.includes('/p/') && !href.includes('/explore/') &&
              !href.includes('/accounts/') && !href.includes('/direct/')) {
            author.handle = href.replace(/\//g, '');
            break;
          }
        }
      }

      // Find avatar
      const avatarSelectors = [
        'header img[alt*="profile"]',
        'header img[src*="profile"]',
        'header span[role="link"] img',
        'header img'
      ];

      for (const selector of avatarSelectors) {
        const avatarImg = postElement?.querySelector(selector);
        if (avatarImg && avatarImg.src && avatarImg.src.includes('instagram')) {
          author.avatar_url = avatarImg.src;

          // Sometimes the alt contains the username
          const alt = avatarImg.getAttribute('alt');
          if (alt && !author.name && !alt.includes('profile picture')) {
            const nameMatch = alt.match(/^(.+?)'s profile/i);
            if (nameMatch) {
              author.name = nameMatch[1];
            }
          }
          break;
        }
      }

      // Check for verified badge
      const verifiedSelectors = [
        'header svg[aria-label*="Verified"]',
        'header [title*="Verified"]',
        'svg[aria-label="Verified"]'
      ];

      for (const selector of verifiedSelectors) {
        if (postElement?.querySelector(selector)) {
          author.is_verified = true;
          break;
        }
      }

      // Use handle as name if no name found
      if (author.handle && !author.name) {
        author.name = author.handle;
      }

      console.log('[Instagram Filter] Extracted author:', author);

    } catch (error) {
      console.error('[Instagram Filter] Error extracting author info:', error);
    }

    return author;
  }

  /**
   * Extract caption text from post element
   * @param {Element} postElement - Post article element
   * @returns {string} Caption text
   */
  function extractCaption(postElement) {
    try {
      // Caption is usually in a span with the class containing "caption" or near the username
      const captionSelectors = [
        'div[class*="caption"] span',
        'li span[class] > span',
        'article div > span[dir="auto"]',
        'h1 + div span'
      ];

      for (const selector of captionSelectors) {
        const captionEl = postElement?.querySelector(selector);
        if (captionEl) {
          const text = captionEl.textContent?.trim();
          if (text && text.length > 0) {
            console.log('[Instagram Filter] Found caption:', text.substring(0, 50) + '...');
            return text;
          }
        }
      }

      // Try to find caption from aria-labels or structured content
      const allSpans = postElement?.querySelectorAll('span[dir="auto"]');
      for (const span of allSpans || []) {
        const text = span.textContent?.trim();
        // Caption is usually longer than a username and doesn't start with @
        if (text && text.length > 10 && !text.startsWith('@') && !text.includes(' likes')) {
          return text;
        }
      }

      return '';
    } catch (error) {
      console.error('[Instagram Filter] Error extracting caption:', error);
      return '';
    }
  }

  /**
   * Extract media from post element
   * @param {Element} postElement - Post article element
   * @returns {Array} Array of media objects
   */
  function extractMedia(postElement) {
    const media = [];

    try {
      // Find images
      const imageSelectors = [
        'article img[src*="instagram"]',
        'div[role="button"] img[src*="instagram"]',
        'img[class*="x5yr21d"]',
        'article div img'
      ];

      const seenUrls = new Set();

      for (const selector of imageSelectors) {
        const images = postElement?.querySelectorAll(selector);
        for (const img of images || []) {
          const src = img.src;
          // Skip profile pictures and icons
          if (src && src.includes('instagram') &&
              !src.includes('profile') && !src.includes('_s.jpg') &&
              !seenUrls.has(src)) {
            seenUrls.add(src);
            media.push({
              type: 'image',
              url: src,
              thumb_url: src,
              alt_text: img.getAttribute('alt') || ''
            });
          }
        }
      }

      // Find videos
      const videos = postElement?.querySelectorAll('video');
      for (const video of videos || []) {
        const src = video.src || video.querySelector('source')?.src;
        const poster = video.poster;
        if (src || poster) {
          media.push({
            type: 'video',
            url: src || '',
            thumb_url: poster || '',
            duration: video.duration || 0
          });
        }
      }

      console.log('[Instagram Filter] Extracted media:', media.length, 'items');

    } catch (error) {
      console.error('[Instagram Filter] Error extracting media:', error);
    }

    return media;
  }

  /**
   * Extract engagement metrics from post element
   * @param {Element} postElement - Post article element
   * @returns {Object} Metrics data
   */
  function extractMetrics(postElement) {
    const metrics = {
      likes: 0,
      comments: 0,
      views: 0
    };

    try {
      // Find likes - various formats
      const likeSelectors = [
        'a[href*="/liked_by/"]',
        'button span[class]',
        'section span',
        'div[class] span'
      ];

      for (const selector of likeSelectors) {
        const elements = postElement?.querySelectorAll(selector);
        for (const el of elements || []) {
          const text = el.textContent?.trim();
          if (text && (text.includes('like') || text.match(/^[\d,.KMB]+$/))) {
            const count = parseMetric(text);
            if (count > metrics.likes) {
              metrics.likes = count;
            }
          }
        }
      }

      // Find view count for videos/reels
      const viewTexts = postElement?.querySelectorAll('span');
      for (const span of viewTexts || []) {
        const text = span.textContent?.trim();
        if (text && text.toLowerCase().includes('view')) {
          const count = parseMetric(text);
          if (count > 0) {
            metrics.views = count;
            break;
          }
        }
      }

      // Count visible comments or find comment count
      const commentSection = postElement?.querySelector('ul[class]');
      if (commentSection) {
        const commentItems = commentSection.querySelectorAll('li');
        metrics.comments = commentItems.length;
      }

      console.log('[Instagram Filter] Extracted metrics:', metrics);

    } catch (error) {
      console.error('[Instagram Filter] Error extracting metrics:', error);
    }

    return metrics;
  }

  /**
   * Extract hashtags and mentions from text
   * @param {string} text - Caption text
   * @returns {Object} Entities data
   */
  function extractEntities(text) {
    const entities = {
      hashtags: [],
      mentions: []
    };

    if (!text) return entities;

    try {
      // Extract hashtags
      const hashtagMatches = text.match(/#[a-zA-Z0-9_]+/g);
      if (hashtagMatches) {
        entities.hashtags = hashtagMatches.map(h => h.substring(1));
      }

      // Extract mentions
      const mentionMatches = text.match(/@[a-zA-Z0-9._]+/g);
      if (mentionMatches) {
        entities.mentions = mentionMatches.map(m => m.substring(1));
      }

    } catch (error) {
      console.error('[Instagram Filter] Error extracting entities:', error);
    }

    return entities;
  }

  /**
   * Extract complete post data from article element
   * @param {Element} postElement - Post article element
   * @returns {Object|null} Post data or null
   */
  function extractPostData(postElement) {
    if (!postElement) return null;

    try {
      const postUrl = getPostUrl(postElement);
      const postId = extractPostId(postUrl);

      if (!postId) {
        console.warn('[Instagram Filter] Could not extract post ID from:', postUrl);
        return null;
      }

      const author = extractAuthorInfo(postElement);
      const caption = extractCaption(postElement);
      const media = extractMedia(postElement);
      const metrics = extractMetrics(postElement);
      const entities = extractEntities(caption);

      // Determine post type
      let postType = 'post';
      if (postUrl.includes('/reel/')) {
        postType = 'reel';
      } else if (postUrl.includes('/tv/')) {
        postType = 'igtv';
      } else if (media.some(m => m.type === 'video')) {
        postType = 'video';
      }

      const result = {
        tweet_id: postId, // Using tweet_id for compatibility with existing schema
        post_id: postId,
        post_type: postType,
        platform: 'instagram',

        // Author info
        user_handle: author.handle,
        user_name: author.name,
        user_avatar: author.avatar_url,
        user_verified: author.is_verified,
        user_blue_verified: author.is_verified,
        user_business: false,
        user_government: false,

        // Content
        text: caption,

        // Entities
        urls: [],
        hashtags: entities.hashtags,
        mentions: entities.mentions,

        // Engagement metrics
        reply_count: metrics.comments,
        retweet_count: 0, // Instagram doesn't have retweets
        like_count: metrics.likes,
        view_count: metrics.views,
        bookmark_count: 0,

        // No quote posts on Instagram
        quoted_tweet: null,
        quoted_text: '',
        quoted_author: '',

        // Media
        media: media,

        // Card/link preview - Instagram doesn't have these
        card: null,

        // Reply info
        is_reply: false,
        reply_to: null,

        // Timestamps
        original_created_at: null, // Instagram doesn't expose exact timestamp in DOM
        captured_at: new Date().toISOString(),

        // Source
        source_url: postUrl,
        source: 'browser'
      };

      console.log('[Instagram Filter] Full extracted data:', {
        post_id: postId,
        author: author,
        metrics: metrics,
        has_media: media.length,
        post_type: postType
      });

      return result;

    } catch (error) {
      console.error('[Instagram Filter] Error extracting post data:', error);
      return null;
    }
  }

  /**
   * Find the parent post article for an element
   * @param {Element} element - Starting element
   * @returns {Element|null} Post article or null
   */
  function findPostArticle(element) {
    let current = element;
    while (current && current !== document.body) {
      if (current.tagName === 'ARTICLE') {
        return current;
      }
      // Instagram also uses div with role="presentation" for modal posts
      if (current.getAttribute?.('role') === 'dialog' ||
          current.getAttribute?.('role') === 'presentation') {
        const article = current.querySelector('article');
        if (article) return article;
      }
      current = current.parentElement;
    }
    return null;
  }

  /**
   * Queue a post for capture
   * @param {Object} postData - Post data
   */
  function queueCapture(postData) {
    if (!postData || !postData.post_id) {
      console.warn('[Instagram Filter] queueCapture called with invalid data:', postData);
      return;
    }

    // Check if already queued
    if (captureQueue.some(p => p.post_id === postData.post_id)) {
      console.log('[Instagram Filter] Post already in queue:', postData.post_id);
      return;
    }

    console.log('[Instagram Filter] Queuing post for capture:', postData.post_id);
    captureQueue.push(postData);

    // Debounce sending to background
    if (queueTimeout) clearTimeout(queueTimeout);
    queueTimeout = setTimeout(flushCaptureQueue, CAPTURE_DEBOUNCE_MS);
  }

  /**
   * Send queued captures to background script
   */
  async function flushCaptureQueue() {
    if (captureQueue.length === 0) return;

    console.log('[Instagram Filter] Flushing capture queue, items:', captureQueue.length);

    const items = [...captureQueue];
    captureQueue = [];

    for (const item of items) {
      try {
        console.log('[Instagram Filter] Sending to background:', item.post_id, {
          user: item.user_handle,
          has_avatar: !!item.user_avatar,
          like_count: item.like_count
        });
        const response = await chrome.runtime.sendMessage({
          type: 'CAPTURE_INSTAGRAM',
          data: item
        });
        console.log('[Instagram Filter] Background response:', response);
        showCaptureIndicator(item);
      } catch (error) {
        console.error('[Instagram Filter] Error sending capture:', error);
      }
    }
  }

  /**
   * Show visual indicator when a post is captured
   * @param {Object} postData - Captured post data
   */
  function showCaptureIndicator(postData) {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = 'rf-ig-capture-toast';
    toast.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
      </svg>
      <span>Post captured</span>
    `;

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add('rf-ig-capture-toast-visible');
    });

    // Remove after delay
    setTimeout(() => {
      toast.classList.remove('rf-ig-capture-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  /**
   * Handle save/bookmark button click
   * @param {Element} postElement - Post element that was saved
   */
  function handleSaveAction(postElement) {
    const postData = extractPostData(postElement);
    if (postData) {
      queueCapture(postData);
    }
  }

  /**
   * Check if element is a save button
   * @param {Element} element - Element to check
   * @returns {boolean} True if save button
   */
  function isSaveButton(element) {
    if (!element) return false;

    // Check for save button by aria-label
    const ariaLabel = element.getAttribute?.('aria-label')?.toLowerCase() || '';
    if (ariaLabel.includes('save') || ariaLabel.includes('bookmark')) {
      return true;
    }

    // Check SVG inside for save icon
    const svg = element.tagName === 'svg' ? element : element.querySelector?.('svg');
    if (svg) {
      const svgLabel = svg.getAttribute('aria-label')?.toLowerCase() || '';
      if (svgLabel.includes('save') || svgLabel.includes('bookmark')) {
        return true;
      }
    }

    // Check parent button
    const button = element.closest('button');
    if (button) {
      const buttonLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
      if (buttonLabel.includes('save') || buttonLabel.includes('bookmark')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Setup event listeners for save button detection
   */
  function setupEventListeners() {
    // Track mouse position and hovered post
    document.addEventListener('mousemove', (event) => {
      lastMousePosition = { x: event.clientX, y: event.clientY };

      const element = document.elementFromPoint(event.clientX, event.clientY);
      if (element) {
        const post = findPostArticle(element);
        if (post) {
          lastHoveredPost = post;
        }
      }
    }, { passive: true });

    document.addEventListener('mouseover', (event) => {
      const post = findPostArticle(event.target);
      if (post) {
        lastHoveredPost = post;
      }
    }, { passive: true });

    // Listen for clicks on save buttons
    document.addEventListener('click', (event) => {
      const target = event.target;

      // Check if this is a save button click
      if (isSaveButton(target) || isSaveButton(target.closest('button')) || isSaveButton(target.closest('div[role="button"]'))) {
        console.log('[Instagram Filter] Save button clicked');

        // Find the post being saved
        const post = findPostArticle(target) || lastHoveredPost || findBestPostToCapture();

        if (post) {
          // Small delay to let Instagram update the UI
          setTimeout(() => {
            handleSaveAction(post);
          }, 100);
        }
      }
    }, true);
  }

  /**
   * Setup MutationObserver to detect save actions via DOM changes
   */
  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Check for save button state changes (filled vs outline)
        if (mutation.type === 'attributes' && mutation.attributeName === 'aria-label') {
          const element = mutation.target;
          const label = element.getAttribute('aria-label')?.toLowerCase() || '';

          // Detect when save state changes to "Remove"
          if (label.includes('remove') && (label.includes('save') || label.includes('collection'))) {
            console.log('[Instagram Filter] Detected save via attribute change');
            const post = findPostArticle(element) || lastHoveredPost;
            if (post) {
              handleSaveAction(post);
            }
          }
        }
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['aria-label'],
      subtree: true
    });

    return observer;
  }

  /**
   * Find the best post to capture on the current page
   * @returns {Element|null} Post element or null
   */
  function findBestPostToCapture() {
    // On a single post page
    const url = window.location.href;
    if (url.match(/\/(p|reel|tv)\/[A-Za-z0-9_-]+/)) {
      const mainPost = document.querySelector('article');
      if (mainPost) {
        console.log('[Instagram Filter] Found main post on single post page');
        return mainPost;
      }
    }

    // Check modal/dialog first
    const modal = document.querySelector('div[role="dialog"] article');
    if (modal) {
      console.log('[Instagram Filter] Found post in modal');
      return modal;
    }

    // Use tracked hovered post
    if (lastHoveredPost && document.body.contains(lastHoveredPost)) {
      return lastHoveredPost;
    }

    // Find post under mouse
    const element = document.elementFromPoint(lastMousePosition.x, lastMousePosition.y);
    const postUnderMouse = findPostArticle(element);
    if (postUnderMouse) {
      return postUnderMouse;
    }

    // Find post closest to viewport center
    const posts = document.querySelectorAll('article');
    const viewportCenter = window.innerHeight / 2;
    let bestPost = null;
    let bestDistance = Infinity;

    for (const post of posts) {
      const rect = post.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

      const visibleTop = Math.max(0, rect.top);
      const visibleBottom = Math.min(window.innerHeight, rect.bottom);
      const postCenter = visibleTop + (visibleBottom - visibleTop) / 2;
      const distance = Math.abs(postCenter - viewportCenter);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestPost = post;
      }
    }

    return bestPost;
  }

  /**
   * Listen for messages from popup/background
   */
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'MANUAL_CAPTURE' || message.type === 'MANUAL_CAPTURE_INSTAGRAM') {
        console.log('[Instagram Filter] Manual capture requested');

        const post = findBestPostToCapture();

        if (post) {
          const postData = extractPostData(post);
          console.log('[Instagram Filter] Extracted post data:', postData);

          if (postData && postData.post_id) {
            queueCapture(postData);
            sendResponse({ success: true, data: postData });
          } else {
            sendResponse({ success: false, error: 'Could not extract post data' });
          }
        } else {
          sendResponse({ success: false, error: 'No post found on page' });
        }
        return true;
      }

      if (message.type === 'GET_CURRENT_POST') {
        const post = findBestPostToCapture();

        if (post) {
          const postData = extractPostData(post);
          sendResponse({ success: true, data: postData });
        } else {
          sendResponse({ success: false, error: 'No post found' });
        }
        return true;
      }

      if (message.type === 'PING') {
        sendResponse({ success: true, platform: 'instagram' });
        return true;
      }
    });
  }

  /**
   * Initialize the capture system
   */
  function init() {
    console.log('[Instagram Filter] Initializing capture system');

    setupEventListeners();
    setupMutationObserver();
    setupMessageListener();

    console.log('[Instagram Filter] Capture system ready');
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
