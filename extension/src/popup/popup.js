/**
 * Popup script for Retweet Filter
 * Self-contained without ES module imports for Chrome extension compatibility
 */

// Constants (inlined to avoid module import issues)
const MESSAGES = {
  CAPTURE_RETWEET: 'CAPTURE_RETWEET',
  GET_RETWEETS: 'GET_RETWEETS',
  SEARCH_RETWEETS: 'SEARCH_RETWEETS',
  GET_STATS: 'GET_STATS',
  OPEN_DASHBOARD: 'OPEN_DASHBOARD'
};

// Utility functions (inlined)
function formatDate(date) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

// DOM Elements
let searchInput, clearSearchBtn, quickFiltersEl, resultsContainer, resultsList;
let loadingEl, emptyStateEl, totalCountEl, todayCountEl, unsyncedCountEl;
let openDashboardBtn, captureManualBtn;

// State
let currentFilter = null;
let categories = {};

/**
 * Initialize popup
 */
async function init() {
  console.log('[Popup] Initializing...');

  // Cache DOM elements
  searchInput = document.getElementById('searchInput');
  clearSearchBtn = document.getElementById('clearSearch');
  quickFiltersEl = document.getElementById('quickFilters');
  resultsContainer = document.getElementById('resultsContainer');
  resultsList = document.getElementById('resultsList');
  loadingEl = document.getElementById('loading');
  emptyStateEl = document.getElementById('emptyState');
  totalCountEl = document.getElementById('totalCount');
  todayCountEl = document.getElementById('todayCount');
  unsyncedCountEl = document.getElementById('unsyncedCount');
  openDashboardBtn = document.getElementById('openDashboard');
  captureManualBtn = document.getElementById('captureManual');

  // Show loading, hide empty state
  if (loadingEl) loadingEl.hidden = false;
  if (emptyStateEl) emptyStateEl.hidden = true;
  if (resultsList) resultsList.innerHTML = '';

  try {
    console.log('[Popup] Loading stats...');
    // Load stats
    await loadStats();
    console.log('[Popup] Stats loaded');

    console.log('[Popup] Loading categories...');
    // Load categories for filters
    await loadCategories();
    console.log('[Popup] Categories loaded');

    console.log('[Popup] Loading retweets...');
    // Load recent retweets
    await loadRetweets();
    console.log('[Popup] Retweets loaded');

    // Setup event listeners
    setupEventListeners();
    console.log('[Popup] Event listeners set up');
  } catch (error) {
    console.error('[Popup] Init error:', error);
    showError('Failed to load data: ' + error.message);
  }

  // Hide loading
  if (loadingEl) loadingEl.hidden = true;
  console.log('[Popup] Initialization complete');
}

/**
 * Load statistics
 */
async function loadStats() {
  try {
    console.log('[Popup] Sending GET_STATS message...');
    const response = await chrome.runtime.sendMessage({ type: MESSAGES.GET_STATS });
    console.log('[Popup] GET_STATS response:', response);

    if (response && response.success) {
      const stats = response.data;
      if (totalCountEl) totalCountEl.textContent = formatNumber(stats.total || 0);
      if (todayCountEl) todayCountEl.textContent = formatNumber(stats.today || 0);
      if (unsyncedCountEl) unsyncedCountEl.textContent = formatNumber(stats.unsynced || 0);
    } else {
      // Default values if no response
      if (totalCountEl) totalCountEl.textContent = '0';
      if (todayCountEl) todayCountEl.textContent = '0';
      if (unsyncedCountEl) unsyncedCountEl.textContent = '0';
    }
  } catch (error) {
    console.error('loadStats error:', error);
    // Set defaults on error
    if (totalCountEl) totalCountEl.textContent = '0';
    if (todayCountEl) todayCountEl.textContent = '0';
    if (unsyncedCountEl) unsyncedCountEl.textContent = '0';
  }
}

/**
 * Load categories for quick filters
 */
async function loadCategories() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CATEGORIES' });

    if (response && response.success) {
      categories = response.data || {};
      renderQuickFilters();
    }
  } catch (error) {
    console.error('loadCategories error:', error);
  }
}

/**
 * Render quick filter chips
 */
async function renderQuickFilters() {
  if (!quickFiltersEl) return;

  try {
    const response = await chrome.runtime.sendMessage({ type: MESSAGES.GET_STATS });

    if (response && response.success) {
      const tagCounts = response.data.byTag || {};
      const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

      quickFiltersEl.innerHTML = topTags.map(([tag, count]) => `
        <button class="filter-chip ${currentFilter === tag ? 'active' : ''}" data-tag="${escapeHtml(tag)}">
          ${escapeHtml(tag)}
          <span class="filter-chip-count">${count}</span>
        </button>
      `).join('');
    }
  } catch (error) {
    console.error('renderQuickFilters error:', error);
  }
}

/**
 * Load retweets (recent or search results)
 */
async function loadRetweets(query = '', filter = null) {
  if (loadingEl) loadingEl.hidden = false;
  if (resultsList) resultsList.innerHTML = '';

  try {
    let response;

    if (query) {
      response = await chrome.runtime.sendMessage({
        type: MESSAGES.SEARCH_RETWEETS,
        data: {
          query,
          filters: filter ? { tags: [filter] } : {}
        }
      });
    } else if (filter) {
      response = await chrome.runtime.sendMessage({
        type: 'FILTER_RETWEETS',
        data: { tags: [filter] }
      });
      if (response && response.success) {
        response.data = response.data.map(item => ({ item, score: 0, matches: [] }));
      }
    } else {
      response = await chrome.runtime.sendMessage({
        type: MESSAGES.GET_RETWEETS,
        data: { page: 1, pageSize: 20 }
      });
      if (response && response.success) {
        response.data = (response.data.items || []).map(item => ({ item, score: 0, matches: [] }));
      }
    }

    if (response && response.success && response.data && response.data.length > 0) {
      renderResults(response.data);
      if (emptyStateEl) emptyStateEl.hidden = true;
    } else {
      if (emptyStateEl) {
        emptyStateEl.hidden = false;
        const pEl = emptyStateEl.querySelector('p');
        const spanEl = emptyStateEl.querySelector('span');
        if (query) {
          if (pEl) pEl.textContent = 'No results found';
          if (spanEl) spanEl.textContent = 'Try a different search term';
        } else {
          if (pEl) pEl.textContent = 'No retweets captured yet';
          if (spanEl) spanEl.textContent = 'Retweet something on X to get started';
        }
      }
    }
  } catch (error) {
    console.error('loadRetweets error:', error);
    showError('Failed to load retweets');
  }

  if (loadingEl) loadingEl.hidden = true;
}

/**
 * Format metric number for display (e.g., 1200 -> "1.2K")
 */
function formatMetric(num) {
  if (!num || num === 0) return '';
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toString();
}

/**
 * Get verification badge HTML
 */
function getVerificationBadge(item) {
  if (!item.user_verified) return '';

  if (item.user_business) {
    return '<svg class="verified-badge gold" viewBox="0 0 22 22" width="16" height="16"><path fill="currentColor" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681.132-.637.075-1.299-.165-1.903.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/></svg>';
  }

  if (item.user_government) {
    return '<svg class="verified-badge gray" viewBox="0 0 22 22" width="16" height="16"><path fill="currentColor" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681.132-.637.075-1.299-.165-1.903.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/></svg>';
  }

  // Blue verified
  return '<svg class="verified-badge blue" viewBox="0 0 22 22" width="16" height="16"><path fill="currentColor" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681.132-.637.075-1.299-.165-1.903.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/></svg>';
}

/**
 * Render search/list results
 */
function renderResults(results) {
  if (!resultsList) return;

  resultsList.innerHTML = results.slice(0, 20).map(({ item, matches }) => {
    const initials = getInitials(item.user_name || item.user_handle);
    const allTags = [...(item.tags || []), ...(item.auto_tags || [])];
    const hasAvatar = item.user_avatar && item.user_avatar.length > 0;
    const verificationBadge = getVerificationBadge(item);

    // Format metrics
    const likes = formatMetric(item.like_count);
    const retweets = formatMetric(item.retweet_count);
    const views = formatMetric(item.view_count);

    // Format date - show original tweet date if available
    const displayDate = item.original_created_at
      ? formatDate(item.original_created_at)
      : formatDate(item.captured_at);

    return `
      <div class="result-item" data-id="${item.id}" data-url="${escapeHtml(item.source_url || '')}">
        ${hasAvatar
          ? `<img class="result-avatar-img" src="${escapeHtml(item.user_avatar)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="result-avatar" style="display:none">${initials}</div>`
          : `<div class="result-avatar">${initials}</div>`
        }
        <div class="result-content">
          <div class="result-header">
            <span class="result-name">${escapeHtml(item.user_name || item.user_handle || 'Unknown')}</span>
            ${verificationBadge}
            <span class="result-handle">@${escapeHtml(item.user_handle || '')}</span>
            <span class="result-dot">·</span>
            <span class="result-time">${displayDate}</span>
          </div>
          <div class="result-text">${escapeHtml(truncateText(item.text || '', 140))}</div>
          ${item.media && item.media.length > 0 ? `
            <div class="result-media">
              ${item.media.slice(0, 1).map(m => `
                <img class="result-media-thumb" src="${escapeHtml(m.thumb_url || m.url)}" alt="${m.type}" onerror="this.style.display='none'">
              `).join('')}
              ${item.media.length > 1 ? `<span class="media-count">+${item.media.length - 1}</span>` : ''}
            </div>
          ` : ''}
          <div class="result-metrics">
            ${retweets ? `<span class="metric"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/></svg>${retweets}</span>` : ''}
            ${likes ? `<span class="metric"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/></svg>${likes}</span>` : ''}
            ${views ? `<span class="metric"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"/></svg>${views}</span>` : ''}
          </div>
          ${allTags.length > 0 ? `
            <div class="result-tags">
              ${allTags.slice(0, 3).map(tag => `
                <span class="result-tag ${(item.auto_tags || []).includes(tag) ? 'auto' : ''}">${escapeHtml(tag)}</span>
              `).join('')}
              ${allTags.length > 3 ? `<span class="result-tag">+${allTags.length - 3}</span>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Search input
  if (searchInput) {
    const debouncedSearch = debounce(() => {
      const query = searchInput.value.trim();
      if (clearSearchBtn) clearSearchBtn.hidden = query.length === 0;
      loadRetweets(query, currentFilter);
    }, 300);

    searchInput.addEventListener('input', debouncedSearch);
  }

  // Clear search
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      clearSearchBtn.hidden = true;
      loadRetweets('', currentFilter);
    });
  }

  // Quick filters
  if (quickFiltersEl) {
    quickFiltersEl.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;

      const tag = chip.dataset.tag;

      if (currentFilter === tag) {
        currentFilter = null;
        chip.classList.remove('active');
      } else {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilter = tag;
      }

      loadRetweets(searchInput ? searchInput.value.trim() : '', currentFilter);
    });
  }

  // Result item click
  if (resultsList) {
    resultsList.addEventListener('click', (e) => {
      const item = e.target.closest('.result-item');
      if (!item) return;

      const url = item.dataset.url;
      if (url) {
        chrome.tabs.create({ url });
      }
    });
  }

  // Open dashboard
  if (openDashboardBtn) {
    openDashboardBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: MESSAGES.OPEN_DASHBOARD });
      window.close();
    });
  }

  // Manual capture
  if (captureManualBtn) {
    captureManualBtn.addEventListener('click', async () => {
      captureManualBtn.disabled = true;
      captureManualBtn.textContent = 'Capturing...';

      try {
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || (!tab.url?.includes('x.com') && !tab.url?.includes('twitter.com'))) {
          showToast('Please open X/Twitter first');
          resetCaptureButton();
          return;
        }

        // Helper function to attempt capture with retries
        async function attemptCapture(maxRetries = 3) {
          let lastError = null;
          let lastResponse = null;

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(`[Popup] Capture attempt ${attempt}/${maxRetries}`);

              // Try to send message to content script
              let response;
              try {
                response = await chrome.tabs.sendMessage(tab.id, { type: 'MANUAL_CAPTURE' });
              } catch (msgError) {
                // Content script might not be loaded - try injecting it
                console.log('[Popup] Content script not found, injecting...');
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  files: ['src/content/capture.js']
                });
                await chrome.scripting.insertCSS({
                  target: { tabId: tab.id },
                  files: ['src/content/styles.css']
                });
                // Wait for the script to initialize
                await new Promise(resolve => setTimeout(resolve, 500));
                // Retry the message
                response = await chrome.tabs.sendMessage(tab.id, { type: 'MANUAL_CAPTURE' });
              }

              if (response && response.success) {
                return response; // Success!
              }

              // Capture failed but no error - store response and maybe retry
              lastResponse = response;
              console.log(`[Popup] Attempt ${attempt} failed:`, response?.error);

              // Wait before retry (increasing delay)
              if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 300 * attempt));
              }
            } catch (error) {
              lastError = error;
              console.log(`[Popup] Attempt ${attempt} error:`, error.message);

              // Wait before retry
              if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 300 * attempt));
              }
            }
          }

          // All retries failed
          if (lastError) throw lastError;
          return lastResponse;
        }

        const response = await attemptCapture(3);

        if (response && response.success) {
          showToast('Retweet captured!');
          await loadStats();
          await loadRetweets(searchInput ? searchInput.value.trim() : '', currentFilter);
        } else {
          showToast(response?.error || 'No tweet found to capture');
        }
      } catch (error) {
        console.error('Manual capture error:', error);
        showToast('Failed to capture. Please refresh and try again.');
      }

      resetCaptureButton();
    });
  }

  // Focus search on load
  if (searchInput) searchInput.focus();
}

function resetCaptureButton() {
  if (captureManualBtn) {
    captureManualBtn.disabled = false;
    captureManualBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
      </svg>
      Capture Current
    `;
  }
}

/**
 * Show error message
 */
function showError(message) {
  if (emptyStateEl) {
    emptyStateEl.hidden = false;
    const pEl = emptyStateEl.querySelector('p');
    const spanEl = emptyStateEl.querySelector('span');
    if (pEl) pEl.textContent = 'Error';
    if (spanEl) spanEl.textContent = message;
  }
}

/**
 * Show toast notification
 */
function showToast(message) {
  const existing = document.querySelector('.popup-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'popup-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 70px;
    left: 50%;
    transform: translateX(-50%);
    background: #16181c;
    color: #e7e9ea;
    padding: 8px 16px;
    border-radius: 20px;
    border: 1px solid #2f3336;
    font-size: 13px;
    z-index: 1000;
  `;

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
