/**
 * Content script for capturing videos on YouTube
 * Detects when user likes a video and captures it
 */

(function () {
    'use strict';

    const SCRIPT_VERSION = '1.0.0';
    const DEBUG = true;

    function log(...args) {
        if (DEBUG) console.log('[YouTube Capture]', ...args);
    }

    // Prevent duplicate injection
    if (window.__youtubeFilterInjected === SCRIPT_VERSION) {
        log('Already injected, skipping');
        return;
    }
    window.__youtubeFilterInjected = SCRIPT_VERSION;
    log('v' + SCRIPT_VERSION + ' loading...');

    const CAPTURE_DEBOUNCE_MS = 500;
    const PROCESSED_MARKER = 'data-rf-processed';
    const DUPLICATE_WINDOW_MS = 10000;

    let captureTriggers = {
        twitter: { retweet: true, like: true },
        tiktok: { favorite: true, like: true },
        instagram: { save: true, like: true },
        youtube: { like: true }
    };

    let captureQueue = [];
    let queueTimeout = null;
    const recentlyCaptured = new Set(); // Prevent immediate duplicate captures

    /**
     * Parse metric text (e.g., "1.2K", "15M", "1,234") to number
     */
    function parseMetric(text) {
        if (!text) return 0;

        // Remove "views", "likes", etc.
        text = text.replace(/(views|likes|subscribers|videos).*/i, '').trim();

        const multipliers = { 'K': 1000, 'M': 1000000, 'B': 1000000000 };
        const match = text.match(/^([\d,.]+)([KMB])?$/i);

        if (match) {
            let numStr = match[1].replace(/,/g, '');
            let num = parseFloat(numStr);
            if (match[2]) {
                num *= multipliers[match[2].toUpperCase()];
            }
            return Math.round(num);
        }
        return 0;
    }

    /**
     * Extract video data from the page
     */
    function extractVideoData() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const videoId = urlParams.get('v');

            if (!videoId) {
                // Try shorts URL pattern
                if (window.location.pathname.startsWith('/shorts/')) {
                    const match = window.location.pathname.match(/\/shorts\/([^/?]+)/);
                    if (match) return extractShortsData(match[1]);
                }
                return null;
            }

            // Main video extraction
            const titleEl = document.querySelector('h1.ytd-watch-metadata');
            const title = titleEl?.textContent?.trim() || document.title.replace(' - YouTube', '');

            const channelLink = document.querySelector('.ytd-video-owner-renderer a.yt-simple-endpoint');
            const channelNameEl = document.querySelector('.ytd-video-owner-renderer #channel-name #text');
            const channelHandleEl = document.querySelector('.ytd-video-owner-renderer a[href^="/@"]');

            const channelName = channelNameEl?.textContent?.trim() || '';
            // Extract handle from href (e.g. /@username) or text
            let channelHandle = channelHandleEl?.getAttribute('href')?.substring(2) || ''; // Remove /@
            if (!channelHandle && channelLink) {
                const href = channelLink.getAttribute('href');
                if (href.startsWith('/@')) channelHandle = href.substring(2);
                else channelHandle = channelName.replace(/\s+/g, '');
            }

            const avatarImg = document.querySelector('.ytd-video-owner-renderer #img');
            const avatarUrl = avatarImg?.src || '';

            const viewCountEl = document.querySelector('#view-count') || document.querySelector('.view-count');
            const likeCountEl = document.querySelector('like-button-view-model .yt-spec-button-shape-next__button-text-content') ||
                document.querySelector('#top-level-buttons-computed .ytd-toggle-button-renderer'); // Legacy

            const likeText = likeCountEl?.textContent?.trim() || '0';

            // Thumbnail (using high res default)
            const thumbUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

            // Verified status
            const verifiedBadge = document.querySelector('.ytd-video-owner-renderer ytd-badge-supported-renderer');

            return {
                tweet_id: videoId, // Reusing field for ID
                post_id: videoId,
                platform: 'youtube',

                user_handle: channelHandle,
                user_name: channelName,
                user_avatar: avatarUrl,
                user_verified: !!verifiedBadge,

                text: title,

                media: [{
                    type: 'video',
                    url: window.location.href,
                    thumb_url: thumbUrl,
                    source_platform: 'youtube'
                }],

                like_count: parseMetric(likeText),
                view_count: parseMetric(viewCountEl?.textContent || '0'),

                source_url: window.location.href,
                captured_at: new Date().toISOString()
            };
        } catch (e) {
            console.error('[YouTube Capture] Extraction error:', e);
            return null;
        }
    }

    /**
     * Extract Shorts data
     */
    function extractShortsData(videoId) {
        try {
            // Shorts overlay elements
            const activeShort = document.querySelector('ytd-reel-video-renderer[is-active]');
            if (!activeShort) return null;

            const titleEl = activeShort.querySelector('.title.ytd-reel-player-header-renderer') ||
                activeShort.querySelector('#overlay .title');
            const title = titleEl?.textContent?.trim() || 'YouTube Short';

            const channelEl = activeShort.querySelector('.channel-name') ||
                activeShort.querySelector('#channel-name #text');
            const channelName = channelEl?.textContent?.trim() || '';

            const channelLink = activeShort.querySelector('#channel-info a');
            let channelHandle = '';
            if (channelLink) {
                const href = channelLink.getAttribute('href');
                if (href && href.startsWith('/@')) channelHandle = href.substring(2);
            }
            if (!channelHandle) channelHandle = channelName.replace(/\s+/g, '');

            const avatarImg = activeShort.querySelector('#channel-info img');
            const avatarUrl = avatarImg?.src || '';

            const likeBtn = activeShort.querySelector('#like-button button') ||
                activeShort.querySelector('#like-button .yt-spec-button-shape-next__button-text-content');
            const likeText = likeBtn?.getAttribute('aria-label') || likeBtn?.textContent || '0';
            // "Like this video along with 1,234 other people" -> 1234
            const likeCount = parseMetric(likeText.replace(/\D*([\d,.]+[KMB]?)\D*/i, '$1'));

            return {
                tweet_id: videoId,
                post_id: videoId,
                platform: 'youtube',

                user_handle: channelHandle,
                user_name: channelName,
                user_avatar: avatarUrl,
                user_verified: false, // Harder to detect on shorts

                text: title,

                media: [{
                    type: 'video',
                    url: `https://www.youtube.com/shorts/${videoId}`,
                    thumb_url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, // Shorts thumbs may differ but this usually works
                    source_platform: 'youtube'
                }],

                like_count: likeCount,
                view_count: 0, // Often hidden on shorts overlay

                source_url: `https://www.youtube.com/shorts/${videoId}`,
                captured_at: new Date().toISOString()
            };
        } catch (e) {
            console.error('[YouTube Capture] Shorts extraction error:', e);
            return null;
        }
    }

    /**
     * Capture video
     */
    async function captureVideo() {
        const videoData = extractVideoData();

        if (!videoData) {
            log('Could not extract video data');
            return { success: false, error: 'Could not extract video data' };
        }

        if (recentlyCaptured.has(videoData.post_id)) {
            log('Already captured recently:', videoData.post_id);
            return { success: false, error: 'Already captured' };
        }

        log('Capturing video:', videoData.post_id, videoData.text);

        recentlyCaptured.add(videoData.post_id);
        setTimeout(() => recentlyCaptured.delete(videoData.post_id), DUPLICATE_WINDOW_MS);

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'CAPTURE_YOUTUBE',
                data: videoData
            });

            if (response && response.success) {
                showToast('Video captured!');
                return { success: true, data: videoData };
            } else {
                return { success: false, error: response?.error || 'Failed to save' };
            }
        } catch (error) {
            console.error('[YouTube Capture] Error:', error);
            return { success: false, error: error.message };
        }
    }

    function showToast(message) {
        const existing = document.querySelector('.rf-yt-capture-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'rf-yt-capture-toast';
        toast.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/>
      </svg>
      <span>${message}</span>
    `;

        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('rf-yt-capture-toast-visible');
        });

        setTimeout(() => {
            toast.classList.remove('rf-yt-capture-toast-visible');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    /**
     * Setup observer for Like buttons
     */
    /**
     * Check if element is a like button
     */
    function isLikeButton(element) {
        if (!element) return false;

        // Standard video like button
        if (element.tagName === 'LIKE-BUTTON-VIEW-MODEL') return true;
        if (element.closest('like-button-view-model')) return true;

        // Shorts like button
        if (element.id === 'like-button' || element.closest('#like-button')) return true;

        // Legacy / general check
        const ariaLabel = element.getAttribute('aria-label') || '';
        if (ariaLabel.toLowerCase().includes('like this video')) return true;

        // Closest button with like label
        const btn = element.closest('button');
        if (btn) {
            const label = btn.getAttribute('aria-label') || '';
            if (label.toLowerCase().includes('like this video')) return true;
        }

        return false;
    }

    /**
     * Setup global click listener
     */
    function setupClickListener() {
        document.addEventListener('click', (event) => {
            const target = event.target;

            if (isLikeButton(target)) {
                if (!captureTriggers.youtube?.like) {
                    log('Like capture disabled in settings');
                    return;
                }

                log('Like button clicked!');

                // Delay capture to allow UI update
                setTimeout(() => {
                    captureVideo();
                }, 200);
            }
        }, true);
    }

    function setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'MANUAL_CAPTURE_YOUTUBE' || message.type === 'MANUAL_CAPTURE') {
                captureVideo().then(result => {
                    sendResponse(result);
                });
                return true;
            }
        });
    }

    function init() {
        log('Initializing capture system');

        // Load settings
        chrome.storage.sync.get(['captureTriggers'], (result) => {
            if (result.captureTriggers) {
                captureTriggers = result.captureTriggers;
                log('Loaded triggers:', captureTriggers);
            }
        });

        // Listen for setting changes
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.captureTriggers) {
                captureTriggers = changes.captureTriggers.newValue;
                log('Updated triggers:', captureTriggers);
            }
        });

        setupClickListener();
        setupMessageListener();
        log('Ready');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
