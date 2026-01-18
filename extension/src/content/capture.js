/**
 * Content script for capturing retweets on X.com
 * Uses MutationObserver and event delegation to detect retweet actions
 */

(function() {
  'use strict';

  // Version for detecting updates
  const SCRIPT_VERSION = '1.2.0';

  // Avoid duplicate injection, but allow re-injection if version changed
  if (window.__retweetFilterInjected === SCRIPT_VERSION) {
    console.log('[Retweet Filter] Already injected (same version), skipping');
    return;
  }

  // If there was an old version, clean up listeners (page refresh recommended)
  if (window.__retweetFilterInjected) {
    console.log('[Retweet Filter] Detected version change, reinitializing...');
  }

  window.__retweetFilterInjected = SCRIPT_VERSION;
  console.log('[Retweet Filter] Content script v' + SCRIPT_VERSION + ' loading...');

  const CAPTURE_DEBOUNCE_MS = 300;
  const PROCESSED_MARKER = 'data-rf-processed';

  let captureQueue = [];
  let queueTimeout = null;

  // Track the currently hovered tweet (since :hover doesn't work with querySelector)
  let lastHoveredTweet = null;
  let lastMousePosition = { x: 0, y: 0 };

  /**
   * Parse metric text (e.g., "1.2K", "15M", "123") to number
   * @param {string} text - Metric text
   * @returns {number} Parsed number
   */
  function parseMetric(text) {
    if (!text) return 0;
    text = text.trim().replace(/,/g, '');

    const multipliers = { 'K': 1000, 'M': 1000000, 'B': 1000000000 };
    const match = text.match(/^([\d.]+)([KMB])?$/i);

    if (match) {
      const num = parseFloat(match[1]);
      const suffix = match[2]?.toUpperCase();
      return suffix ? Math.round(num * multipliers[suffix]) : num;
    }

    return parseInt(text, 10) || 0;
  }

  /**
   * Extract author information from tweet element
   * @param {Element} tweetElement - Tweet article element
   * @returns {Object} Author data
   */
  function extractAuthorInfo(tweetElement) {
    const author = {
      handle: '',
      name: '',
      avatar_url: '',
      is_verified: false,
      is_blue_verified: false,
      is_business: false,
      is_government: false
    };

    try {
      // Find profile image - try multiple selectors
      const avatarSelectors = [
        '[data-testid="Tweet-User-Avatar"] img',
        'div[data-testid="Tweet-User-Avatar"] img',
        'a[role="link"] img[src*="profile_images"]',
        'img[src*="profile_images"]'
      ];

      for (const selector of avatarSelectors) {
        const avatarImg = tweetElement.querySelector(selector);
        if (avatarImg && avatarImg.src) {
          author.avatar_url = avatarImg.src;
          console.log('[Retweet Filter] Found avatar:', author.avatar_url.substring(0, 50) + '...');
          break;
        }
      }

      // Strategy 1: Find the User-Name container which has both display name and @handle
      const userNameContainer = tweetElement.querySelector('[data-testid="User-Name"]');
      if (userNameContainer) {
        // The User-Name container typically has links to the user profile
        // First link usually contains the display name, second has the @handle
        const links = userNameContainer.querySelectorAll('a[href^="/"]');

        for (const link of links) {
          const href = link.getAttribute('href');
          // Skip non-user links
          if (!href || href.includes('/status/') || href.includes('/photo/')) continue;

          // Check if this is a username link (matches /username pattern)
          if (href.match(/^\/[a-zA-Z0-9_]+$/)) {
            const handle = href.substring(1);

            // Get the text content
            const linkText = link.textContent?.trim() || '';

            // If it starts with @, it's the handle link
            if (linkText.startsWith('@')) {
              author.handle = handle;
            } else if (linkText && !author.name) {
              // Skip "You reposted", "Retweeted", etc.
              const skipTexts = ['you reposted', 'retweeted', 'reposted', 'pinned', 'promoted'];
              const isSkipText = skipTexts.some(skip => linkText.toLowerCase().includes(skip));

              if (!isSkipText && linkText.length > 0 && linkText.length < 100) {
                author.name = linkText;
                if (!author.handle) {
                  author.handle = handle;
                }
              }
            }
          }
        }

        console.log('[Retweet Filter] User-Name extraction:', { name: author.name, handle: author.handle });
      }

      // Strategy 2: Fallback - look for links near the avatar
      if (!author.handle || !author.name) {
        // Find the avatar container and look for nearby user info
        const avatarContainer = tweetElement.querySelector('[data-testid="Tweet-User-Avatar"]');
        if (avatarContainer) {
          // The user info is usually a sibling of the avatar container's parent
          const parent = avatarContainer.closest('div[class]');
          if (parent && parent.parentElement) {
            const userInfoArea = parent.parentElement;
            const links = userInfoArea.querySelectorAll('a[href^="/"]');

            for (const link of links) {
              const href = link.getAttribute('href');
              if (!href || href.includes('/status/')) continue;

              if (href.match(/^\/[a-zA-Z0-9_]+$/)) {
                const linkText = link.textContent?.trim() || '';
                const handle = href.substring(1);

                // Skip problematic text
                const skipTexts = ['you reposted', 'retweeted', 'reposted', 'pinned', 'promoted'];
                const isSkipText = skipTexts.some(skip => linkText.toLowerCase().includes(skip));

                if (linkText.startsWith('@') && !author.handle) {
                  author.handle = handle;
                } else if (!isSkipText && linkText && !author.name && linkText.length < 100) {
                  author.name = linkText;
                  if (!author.handle) {
                    author.handle = handle;
                  }
                }
              }
            }
          }
        }

        console.log('[Retweet Filter] Avatar-area extraction:', { name: author.name, handle: author.handle });
      }

      // Strategy 3: Last resort - find any valid user link
      if (!author.handle) {
        const userLinks = tweetElement.querySelectorAll('a[href^="/"]');
        for (const link of userLinks) {
          const linkHref = link.getAttribute('href');
          if (linkHref && linkHref.match(/^\/[a-zA-Z0-9_]+$/) && !linkHref.includes('/status/')) {
            const linkText = link.textContent?.trim() || '';
            const skipTexts = ['you reposted', 'retweeted', 'reposted', 'pinned', 'promoted', 'show more', 'translate'];
            const isSkipText = skipTexts.some(skip => linkText.toLowerCase().includes(skip));

            if (!isSkipText) {
              author.handle = linkHref.substring(1);

              if (!author.name && !linkText.startsWith('@') && linkText.length > 0 && linkText.length < 100) {
                author.name = linkText;
              }
              break;
            }
          }
        }

        console.log('[Retweet Filter] Fallback extraction:', { name: author.name, handle: author.handle });
      }

      // If we have handle but no name, use handle as name
      if (author.handle && !author.name) {
        author.name = author.handle;
      }

      // Check for verification badges - try multiple selectors
      const verifiedSelectors = [
        '[data-testid="icon-verified"]',
        'svg[aria-label*="Verified"]',
        'svg[data-testid*="verified"]'
      ];

      for (const selector of verifiedSelectors) {
        const verifiedBadge = tweetElement.querySelector(selector);
        if (verifiedBadge) {
          author.is_verified = true;
          author.is_blue_verified = true;
          console.log('[Retweet Filter] Found verified badge');
          break;
        }
      }

      // Gold checkmark (Business/Organization)
      const goldVerified = tweetElement.querySelector('svg[aria-label*="Verified account"]');
      if (goldVerified) {
        author.is_verified = true;
        // Check color to determine type
        const path = goldVerified.querySelector('path');
        const fill = path?.getAttribute('fill') || '';
        if (fill.includes('D4AF37') || fill.includes('gold')) {
          author.is_business = true;
        }
      }

      // Gray checkmark (Government/Official)
      const grayVerified = tweetElement.querySelector('svg[aria-label*="government"]');
      if (grayVerified) {
        author.is_verified = true;
        author.is_government = true;
      }

    } catch (error) {
      console.error('[Retweet Filter] Error extracting author info:', error);
    }

    return author;
  }

  /**
   * Extract engagement metrics from tweet element
   * @param {Element} tweetElement - Tweet article element
   * @returns {Object} Metrics data
   */
  function extractMetrics(tweetElement) {
    const metrics = {
      replies: 0,
      retweets: 0,
      likes: 0,
      views: 0,
      bookmarks: 0
    };

    try {
      // Reply count
      const replyButton = tweetElement.querySelector('[data-testid="reply"]');
      if (replyButton) {
        const replyText = replyButton.querySelector('span[data-testid="app-text-transition-container"]')?.textContent ||
                          replyButton.querySelector('[dir="ltr"]')?.textContent ||
                          replyButton.textContent;
        metrics.replies = parseMetric(replyText);
      }

      // Retweet count
      const retweetButton = tweetElement.querySelector('[data-testid="retweet"]');
      if (retweetButton) {
        const retweetText = retweetButton.querySelector('span[data-testid="app-text-transition-container"]')?.textContent ||
                            retweetButton.querySelector('[dir="ltr"]')?.textContent ||
                            retweetButton.textContent;
        metrics.retweets = parseMetric(retweetText);
      }

      // Like count
      const likeButton = tweetElement.querySelector('[data-testid="like"]');
      if (likeButton) {
        const likeText = likeButton.querySelector('span[data-testid="app-text-transition-container"]')?.textContent ||
                         likeButton.querySelector('[dir="ltr"]')?.textContent ||
                         likeButton.textContent;
        metrics.likes = parseMetric(likeText);
      }

      // View count (analytics) - multiple selectors
      const viewsSelectors = [
        'a[href*="/analytics"]',
        '[data-testid="app-text-transition-container"] span'
      ];
      for (const selector of viewsSelectors) {
        const viewsElement = tweetElement.querySelector(selector);
        if (viewsElement && viewsElement.textContent?.match(/[\d.]+[KMB]?/)) {
          metrics.views = parseMetric(viewsElement.textContent);
          if (metrics.views > 0) break;
        }
      }

      // Bookmark count (if visible)
      const bookmarkButton = tweetElement.querySelector('[data-testid="bookmark"]');
      if (bookmarkButton) {
        const bookmarkText = bookmarkButton.querySelector('span[data-testid="app-text-transition-container"]')?.textContent ||
                             bookmarkButton.querySelector('[dir="ltr"]')?.textContent;
        metrics.bookmarks = parseMetric(bookmarkText);
      }

      console.log('[Retweet Filter] Extracted metrics:', metrics);

    } catch (error) {
      console.error('[Retweet Filter] Error extracting metrics:', error);
    }

    return metrics;
  }

  /**
   * Extract links, hashtags, and mentions from tweet text element
   * @param {Element} textElement - Tweet text element
   * @returns {Object} Entities data
   */
  function extractEntities(textElement) {
    const entities = {
      urls: [],
      hashtags: [],
      mentions: []
    };

    if (!textElement) return entities;

    try {
      // Extract URLs
      const links = textElement.querySelectorAll('a[href]');
      for (const link of links) {
        const href = link.getAttribute('href');
        const text = link.textContent || '';

        if (href?.startsWith('https://t.co/') || href?.includes('http')) {
          entities.urls.push({
            url: href,
            display_url: text,
            expanded_url: link.title || href
          });
        } else if (text.startsWith('#')) {
          entities.hashtags.push(text.substring(1));
        } else if (text.startsWith('@')) {
          entities.mentions.push(text.substring(1));
        }
      }

    } catch (error) {
      console.error('[Retweet Filter] Error extracting entities:', error);
    }

    return entities;
  }

  /**
   * Extract card/link preview data
   * @param {Element} tweetElement - Tweet article element
   * @returns {Object|null} Card data or null
   */
  function extractCard(tweetElement) {
    try {
      const card = tweetElement.querySelector('[data-testid="card.wrapper"]');
      if (!card) return null;

      const cardLink = card.querySelector('a[href]');
      const cardImage = card.querySelector('img');
      const cardTitle = card.querySelector('[data-testid="card.layoutLarge.media"] + div span') ||
                        card.querySelector('span[dir="ltr"]');

      return {
        url: cardLink?.href || '',
        title: cardTitle?.textContent || '',
        image_url: cardImage?.src || '',
        domain: cardLink?.href ? new URL(cardLink.href).hostname : ''
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract full quote tweet data
   * @param {Element} tweetElement - Parent tweet element
   * @returns {Object|null} Quoted tweet data or null
   */
  function extractQuoteTweet(tweetElement) {
    try {
      // Quote tweet container
      const quoteTweetContainer = tweetElement.querySelector('[data-testid="quoteTweet"]') ||
                                   tweetElement.querySelector('div[role="link"][tabindex="0"]');

      if (!quoteTweetContainer) return null;

      // Check if it's actually a quote tweet (has user info inside)
      const quoteUserLink = quoteTweetContainer.querySelector('a[href^="/"]');
      if (!quoteUserLink) return null;

      const quotedData = {
        author: {
          handle: '',
          name: '',
          avatar_url: '',
          is_verified: false
        },
        text: '',
        media: [],
        tweet_id: '',
        original_created_at: null
      };

      // Extract quoted author
      const href = quoteUserLink.getAttribute('href');
      if (href && href.match(/^\/[a-zA-Z0-9_]+$/)) {
        quotedData.author.handle = href.substring(1);
      }

      // Author name
      const nameSpan = quoteUserLink.querySelector('span');
      if (nameSpan) {
        quotedData.author.name = nameSpan.textContent || '';
      }

      // Author avatar
      const quoteAvatar = quoteTweetContainer.querySelector('img[src*="profile_images"]');
      if (quoteAvatar) {
        quotedData.author.avatar_url = quoteAvatar.src;
      }

      // Verified status
      if (quoteTweetContainer.querySelector('[data-testid="icon-verified"]')) {
        quotedData.author.is_verified = true;
      }

      // Quote text
      const quoteTextEl = quoteTweetContainer.querySelector('[data-testid="tweetText"]');
      quotedData.text = quoteTextEl?.textContent || '';

      // Quote media
      const quoteImages = quoteTweetContainer.querySelectorAll('[data-testid="tweetPhoto"] img');
      for (const img of quoteImages) {
        const src = img.getAttribute('src');
        if (src && !src.includes('profile_images')) {
          quotedData.media.push({
            type: 'image',
            url: src,
            thumb_url: src
          });
        }
      }

      // Quote tweet ID from link
      const quoteTweetLink = quoteTweetContainer.querySelector('a[href*="/status/"]');
      if (quoteTweetLink) {
        const quoteHref = quoteTweetLink.getAttribute('href');
        const idMatch = quoteHref?.match(/\/status\/(\d+)/);
        if (idMatch) {
          quotedData.tweet_id = idMatch[1];
        }
      }

      // Quote timestamp
      const quoteTime = quoteTweetContainer.querySelector('time');
      if (quoteTime) {
        quotedData.original_created_at = quoteTime.getAttribute('datetime');
      }

      return quotedData;
    } catch (error) {
      console.error('[Retweet Filter] Error extracting quote tweet:', error);
      return null;
    }
  }

  /**
   * Extract tweet data from a tweet article element
   * @param {Element} tweetElement - Tweet article element
   * @returns {Object|null} Tweet data or null
   */
  function extractTweetData(tweetElement) {
    if (!tweetElement) return null;

    try {
      // Find the tweet link to get tweet ID
      const tweetLink = tweetElement.querySelector('a[href*="/status/"]');
      if (!tweetLink) return null;

      const href = tweetLink.getAttribute('href');
      const tweetIdMatch = href.match(/\/status\/(\d+)/);
      if (!tweetIdMatch) return null;

      const tweetId = tweetIdMatch[1];

      // Extract author information
      const author = extractAuthorInfo(tweetElement);

      // Get tweet text element and content
      const tweetTextElement = tweetElement.querySelector('[data-testid="tweetText"]');
      const text = tweetTextElement ? tweetTextElement.textContent : '';

      // Extract entities (urls, hashtags, mentions)
      const entities = extractEntities(tweetTextElement);

      // Extract engagement metrics
      const metrics = extractMetrics(tweetElement);

      // Extract quote tweet data
      const quoteTweet = extractQuoteTweet(tweetElement);

      // Get media
      const media = [];

      // Images
      const images = tweetElement.querySelectorAll('[data-testid="tweetPhoto"] img');
      for (const img of images) {
        const src = img.getAttribute('src');
        if (src && !src.includes('profile_images')) {
          // Try to get full-size image URL
          let fullUrl = src;
          if (src.includes('?')) {
            fullUrl = src.split('?')[0] + '?format=jpg&name=large';
          }
          media.push({
            type: 'image',
            url: fullUrl,
            thumb_url: src,
            alt_text: img.getAttribute('alt') || ''
          });
        }
      }

      // Videos
      const videos = tweetElement.querySelectorAll('[data-testid="videoPlayer"]');
      for (const video of videos) {
        const videoEl = video.querySelector('video');
        const poster = videoEl?.getAttribute('poster');
        const src = videoEl?.querySelector('source')?.getAttribute('src');
        media.push({
          type: 'video',
          url: src || '',
          thumb_url: poster || '',
          duration: videoEl?.duration || 0
        });
      }

      // GIFs
      const gifs = tweetElement.querySelectorAll('[data-testid="videoPlayer"] video[poster*="tweet_video_thumb"]');
      for (const gif of gifs) {
        media.push({
          type: 'gif',
          url: gif.querySelector('source')?.src || '',
          thumb_url: gif.poster || ''
        });
      }

      // Extract card/link preview
      const card = extractCard(tweetElement);

      // Get timestamp
      const timeElement = tweetElement.querySelector('time');
      const originalCreatedAt = timeElement ? timeElement.getAttribute('datetime') : null;

      // Check if this is a reply
      const isReply = tweetElement.querySelector('[data-testid="tweet"] a[href*="/status/"]')?.closest('[data-testid="tweet"]') !== tweetElement;
      let replyTo = null;
      if (isReply) {
        const replyingTo = tweetElement.querySelector('a[href^="/"][role="link"]');
        if (replyingTo && replyingTo.textContent?.includes('@')) {
          replyTo = replyingTo.textContent.replace('@', '');
        }
      }

      const result = {
        tweet_id: tweetId,

        // Author info (enhanced)
        user_handle: author.handle,
        user_name: author.name,
        user_avatar: author.avatar_url,
        user_verified: author.is_verified,
        user_blue_verified: author.is_blue_verified,
        user_business: author.is_business,
        user_government: author.is_government,

        // Content
        text: text,

        // Entities
        urls: entities.urls,
        hashtags: entities.hashtags,
        mentions: entities.mentions,

        // Engagement metrics
        reply_count: metrics.replies,
        retweet_count: metrics.retweets,
        like_count: metrics.likes,
        view_count: metrics.views,
        bookmark_count: metrics.bookmarks,

        // Quote tweet (enhanced)
        quoted_tweet: quoteTweet,
        // Legacy fields for backward compatibility
        quoted_text: quoteTweet?.text || '',
        quoted_author: quoteTweet?.author?.handle || '',

        // Media
        media: media,

        // Card/link preview
        card: card,

        // Reply info
        is_reply: isReply,
        reply_to: replyTo,

        // Timestamps
        original_created_at: originalCreatedAt,
        captured_at: new Date().toISOString(),

        // Source
        source_url: `https://x.com/${author.handle}/status/${tweetId}`,
        source: 'browser'
      };

      // Debug: log extracted data
      console.log('[Retweet Filter] Full extracted data:', {
        tweet_id: tweetId,
        author: author,
        metrics: metrics,
        has_media: media.length,
        has_quote: !!quoteTweet
      });

      return result;
    } catch (error) {
      console.error('[Retweet Filter] Error extracting tweet data:', error);
      return null;
    }
  }

  /**
   * Find the parent tweet article for an element
   * @param {Element} element - Starting element
   * @returns {Element|null} Tweet article or null
   */
  function findTweetArticle(element) {
    let current = element;
    while (current && current !== document.body) {
      if (current.tagName === 'ARTICLE' && current.getAttribute('data-testid') === 'tweet') {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  /**
   * Queue a retweet for capture
   * @param {Object} tweetData - Tweet data
   */
  function queueCapture(tweetData) {
    if (!tweetData || !tweetData.tweet_id) {
      console.warn('[Retweet Filter] queueCapture called with invalid data:', tweetData);
      return;
    }

    // Check if already queued
    if (captureQueue.some(t => t.tweet_id === tweetData.tweet_id)) {
      console.log('[Retweet Filter] Tweet already in queue:', tweetData.tweet_id);
      return;
    }

    console.log('[Retweet Filter] Queuing tweet for capture:', tweetData.tweet_id);
    captureQueue.push(tweetData);

    // Debounce sending to background
    if (queueTimeout) clearTimeout(queueTimeout);
    queueTimeout = setTimeout(flushCaptureQueue, CAPTURE_DEBOUNCE_MS);
  }

  /**
   * Send queued captures to background script
   */
  async function flushCaptureQueue() {
    if (captureQueue.length === 0) return;

    console.log('[Retweet Filter] Flushing capture queue, items:', captureQueue.length);

    const items = [...captureQueue];
    captureQueue = [];

    for (const item of items) {
      try {
        console.log('[Retweet Filter] Sending to background:', item.tweet_id, {
          user: item.user_handle,
          has_avatar: !!item.user_avatar,
          like_count: item.like_count,
          retweet_count: item.retweet_count
        });
        const response = await chrome.runtime.sendMessage({
          type: 'CAPTURE_RETWEET',
          data: item
        });
        console.log('[Retweet Filter] Background response:', response);
        showCaptureIndicator(item);
      } catch (error) {
        console.error('[Retweet Filter] Error sending capture:', error);
      }
    }
  }

  /**
   * Show visual indicator when a retweet is captured
   * @param {Object} tweetData - Captured tweet data
   */
  function showCaptureIndicator(tweetData) {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = 'rf-capture-toast';
    toast.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
      </svg>
      <span>Retweet captured</span>
    `;

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add('rf-capture-toast-visible');
    });

    // Remove after delay
    setTimeout(() => {
      toast.classList.remove('rf-capture-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  /**
   * Handle retweet button click
   * @param {Event} event - Click event
   */
  function handleRetweetClick(event) {
    const target = event.target;

    // Check if clicking retweet menu item
    const menuItem = target.closest('[data-testid="retweetConfirm"], [data-testid="unretweet"]');
    if (!menuItem) return;

    // Find the tweet being retweeted
    // The menu appears separately, so we need to find the focused/hovered tweet
    // Note: :hover pseudo-selector doesn't work with querySelector, so we use tracked state
    const focusedTweet = lastHoveredTweet ||
                         findTweetUnderMouse() ||
                         document.querySelector('article[data-testid="tweet"][aria-selected="true"]');

    if (focusedTweet) {
      const tweetData = extractTweetData(focusedTweet);
      if (tweetData) {
        queueCapture(tweetData);
      }
    }
  }

  /**
   * Handle retweet via keyboard or other methods
   * @param {Element} tweetElement - Tweet element
   */
  function handleRetweetAction(tweetElement) {
    const tweetData = extractTweetData(tweetElement);
    if (tweetData) {
      queueCapture(tweetData);
    }
  }

  /**
   * Observe DOM mutations for retweet actions
   */
  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          // Check for retweet confirmation menu
          const retweetConfirm = node.querySelector?.('[data-testid="retweetConfirm"]') ||
                                 (node.getAttribute?.('data-testid') === 'retweetConfirm' ? node : null);

          if (retweetConfirm && !retweetConfirm.hasAttribute(PROCESSED_MARKER)) {
            retweetConfirm.setAttribute(PROCESSED_MARKER, 'true');

            // Add click listener to capture when confirmed
            retweetConfirm.addEventListener('click', () => {
              // Find the tweet that was being interacted with
              const tweets = document.querySelectorAll('article[data-testid="tweet"]');
              for (const tweet of tweets) {
                // Check if this tweet has an open retweet menu (button is pressed)
                const retweetBtn = tweet.querySelector('[data-testid="retweet"]');
                if (retweetBtn?.getAttribute('aria-pressed') === 'true' ||
                    retweetBtn?.getAttribute('aria-expanded') === 'true') {
                  handleRetweetAction(tweet);
                  break;
                }
              }

              // Fallback: capture hovered tweet using tracked state
              const hoveredTweet = lastHoveredTweet || findTweetUnderMouse();
              if (hoveredTweet) {
                handleRetweetAction(hoveredTweet);
              }
            }, { once: true });
          }

          // Check for quote tweet button
          const quoteButton = node.querySelector?.('[data-testid="Dropdown"] [role="menuitem"]');
          if (quoteButton?.textContent?.includes('Quote')) {
            // Quote tweets will be captured when they appear in the timeline
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return observer;
  }

  /**
   * Setup hover tracking for tweets
   * Since :hover pseudo-selector doesn't work with querySelector, we track hover manually
   */
  function setupHoverTracking() {
    // Track mouse position for elementFromPoint fallback
    document.addEventListener('mousemove', (event) => {
      lastMousePosition = { x: event.clientX, y: event.clientY };

      // Also update hovered tweet on mouse move (more reliable than mouseenter)
      const element = document.elementFromPoint(event.clientX, event.clientY);
      if (element) {
        const tweet = element.closest('article[data-testid="tweet"]') ||
                      element.closest('article[role="article"]');
        if (tweet) {
          lastHoveredTweet = tweet;
        }
      }
    }, { passive: true });

    // Use mouseover (bubbles) instead of mouseenter for better event delegation
    document.addEventListener('mouseover', (event) => {
      const tweet = event.target.closest?.('article[data-testid="tweet"]') ||
                    event.target.closest?.('article[role="article"]');
      if (tweet) {
        lastHoveredTweet = tweet;
        console.log('[Retweet Filter] Hover tracked on tweet');
      }
    }, { passive: true });

    // Don't clear lastHoveredTweet on mouseleave - keep it until another tweet is hovered
    // This ensures the tweet is still tracked when user clicks the popup button
  }

  /**
   * Find tweet under current mouse position
   * @returns {Element|null} Tweet element or null
   */
  function findTweetUnderMouse() {
    const element = document.elementFromPoint(lastMousePosition.x, lastMousePosition.y);
    if (!element) return null;

    return element.closest('article[data-testid="tweet"]') ||
           element.closest('article[role="article"]') ||
           element.closest('article');
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    // Setup hover tracking first
    setupHoverTracking();

    // Global click handler for retweet buttons
    document.addEventListener('click', (event) => {
      const target = event.target;

      // Direct retweet button click
      const retweetBtn = target.closest('[data-testid="retweet"]');
      if (retweetBtn) {
        // Store reference to the tweet for when menu appears
        const tweet = findTweetArticle(retweetBtn);
        if (tweet) {
          window.__lastRetweetTarget = tweet;
        }
      }

      // Retweet confirm in menu
      const confirmBtn = target.closest('[data-testid="retweetConfirm"]');
      if (confirmBtn) {
        // Use stored reference or find hovered tweet (using tracked state)
        const tweet = window.__lastRetweetTarget ||
                     lastHoveredTweet ||
                     findTweetUnderMouse();
        if (tweet) {
          handleRetweetAction(tweet);
          window.__lastRetweetTarget = null;
        }
      }
    }, true);

    // Keyboard shortcuts (T for retweet in X)
    document.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 't' && !event.ctrlKey && !event.metaKey) {
        // Check if a tweet is focused
        const focusedTweet = document.activeElement?.closest('article[data-testid="tweet"]');
        if (focusedTweet) {
          // Will be captured when retweet menu confirms
          window.__lastRetweetTarget = focusedTweet;
        }
      }
    });
  }

  /**
   * Find the best tweet to capture on the current page
   * @returns {Element|null} Tweet element or null
   */
  function findBestTweetToCapture() {
    // Multiple selector strategies - X may change these
    const TWEET_SELECTORS = [
      'article[data-testid="tweet"]',
      'article[role="article"]',
      '[data-testid="cellInnerDiv"] article',
      'article'
    ];

    // Helper to find tweet with any selector
    function findWithSelectors(suffix = '') {
      for (const selector of TWEET_SELECTORS) {
        const el = document.querySelector(selector + suffix);
        if (el) return el;
      }
      return null;
    }

    // Helper to find all tweets
    function findAllTweets() {
      for (const selector of TWEET_SELECTORS) {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) return els;
      }
      return [];
    }

    console.log('[Retweet Filter] Looking for tweet to capture...');

    // On a single tweet page (x.com/user/status/123), find the main tweet
    const url = window.location.href;
    const isSingleTweetPage = url.match(/\/status\/\d+/);

    if (isSingleTweetPage) {
      // On single tweet page, the first/main tweet is what we want
      const mainTweet = findWithSelectors();
      if (mainTweet) {
        console.log('[Retweet Filter] Found main tweet on single tweet page');
        return mainTweet;
      }
    }

    // Try to find a hovered tweet using tracked state (since :hover doesn't work with querySelector)
    if (lastHoveredTweet && document.body.contains(lastHoveredTweet)) {
      const rect = lastHoveredTweet.getBoundingClientRect();
      console.log('[Retweet Filter] Using tracked hovered tweet at position:', {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        inViewport: rect.top < window.innerHeight && rect.bottom > 0
      });
      return lastHoveredTweet;
    } else {
      console.log('[Retweet Filter] No tracked hover - lastHoveredTweet:', !!lastHoveredTweet);
    }

    // Fallback: try to find tweet under current mouse position
    const tweetUnderMouse = findTweetUnderMouse();
    if (tweetUnderMouse) {
      console.log('[Retweet Filter] Found tweet under mouse cursor');
      return tweetUnderMouse;
    }

    console.log('[Retweet Filter] No hovered tweet found, falling back to viewport detection');

    // Try to find a selected/focused tweet
    for (const selector of TWEET_SELECTORS) {
      const selectedTweet = document.querySelector(selector + '[aria-selected="true"]');
      if (selectedTweet) {
        console.log('[Retweet Filter] Found selected tweet');
        return selectedTweet;
      }
    }

    // Try to find a tweet that's visible in the viewport
    const allTweets = findAllTweets();
    console.log('[Retweet Filter] Found', allTweets.length, 'total tweets on page');

    // First pass: find tweet closest to center of viewport
    const viewportHeight = window.innerHeight;
    const viewportCenter = viewportHeight / 2;
    let bestTweet = null;
    let bestDistance = Infinity;

    for (const tweet of allTweets) {
      const rect = tweet.getBoundingClientRect();

      // Skip tweets completely outside viewport
      if (rect.bottom < 0 || rect.top > viewportHeight) continue;

      // Calculate visible portion
      const visibleTop = Math.max(0, rect.top);
      const visibleBottom = Math.min(viewportHeight, rect.bottom);
      const visibleHeight = visibleBottom - visibleTop;

      // Skip tweets with very little visibility
      if (visibleHeight < 50) continue;

      // Calculate center of visible portion
      const tweetCenter = visibleTop + visibleHeight / 2;
      const distance = Math.abs(tweetCenter - viewportCenter);

      // Prefer tweets closer to center of viewport
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTweet = tweet;
      }
    }

    if (bestTweet) {
      console.log('[Retweet Filter] Found visible tweet closest to viewport center');
      return bestTweet;
    }

    // Last resort: just get the first tweet
    const firstTweet = findWithSelectors();
    if (firstTweet) {
      console.log('[Retweet Filter] Using first tweet as fallback');
      return firstTweet;
    }

    console.log('[Retweet Filter] No tweet found on page. Selectors tried:', TWEET_SELECTORS);
    return null;
  }

  /**
   * Listen for messages from popup/background
   */
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'MANUAL_CAPTURE') {
        console.log('[Retweet Filter] Manual capture requested');

        // Find the best tweet to capture
        const tweet = findBestTweetToCapture();

        if (tweet) {
          const tweetData = extractTweetData(tweet);
          console.log('[Retweet Filter] Extracted tweet data:', tweetData);

          if (tweetData && tweetData.tweet_id) {
            queueCapture(tweetData);
            sendResponse({ success: true, data: tweetData });
          } else {
            sendResponse({ success: false, error: 'Could not extract tweet data' });
          }
        } else {
          sendResponse({ success: false, error: 'No tweet found on page' });
        }
        return true;
      }

      if (message.type === 'GET_CURRENT_TWEET') {
        // Get data of currently visible tweet
        const tweet = findBestTweetToCapture();

        if (tweet) {
          const tweetData = extractTweetData(tweet);
          sendResponse({ success: true, data: tweetData });
        } else {
          sendResponse({ success: false, error: 'No tweet found' });
        }
        return true;
      }
    });
  }

  /**
   * Initialize the capture system
   */
  function init() {
    console.log('[Retweet Filter] Initializing capture system');

    setupEventListeners();
    setupMutationObserver();
    setupMessageListener();

    console.log('[Retweet Filter] Capture system ready');
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
