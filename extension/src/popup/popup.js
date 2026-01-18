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
 * Render search/list results
 */
function renderResults(results) {
  if (!resultsList) return;

  resultsList.innerHTML = results.slice(0, 20).map(({ item, matches }) => {
    const initials = getInitials(item.user_name || item.user_handle);
    const allTags = [...(item.tags || []), ...(item.auto_tags || [])];

    return `
      <div class="result-item" data-id="${item.id}" data-url="${escapeHtml(item.source_url || '')}">
        <div class="result-avatar">${initials}</div>
        <div class="result-content">
          <div class="result-header">
            <span class="result-name">${escapeHtml(item.user_name || item.user_handle || 'Unknown')}</span>
            <span class="result-handle">@${escapeHtml(item.user_handle || '')}</span>
            <span class="result-time">${formatDate(item.captured_at)}</span>
          </div>
          <div class="result-text">${escapeHtml(truncateText(item.text || '', 120))}</div>
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

        // Try to send message to content script
        let response;
        try {
          response = await chrome.tabs.sendMessage(tab.id, { type: 'MANUAL_CAPTURE' });
        } catch (msgError) {
          // Content script might not be loaded - try injecting it
          console.log('[Popup] Content script not found, injecting...');
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['src/content/capture.js']
            });
            await chrome.scripting.insertCSS({
              target: { tabId: tab.id },
              files: ['src/content/styles.css']
            });
            // Wait a moment for the script to initialize
            await new Promise(resolve => setTimeout(resolve, 200));
            // Retry the message
            response = await chrome.tabs.sendMessage(tab.id, { type: 'MANUAL_CAPTURE' });
          } catch (injectError) {
            console.error('[Popup] Failed to inject content script:', injectError);
            showToast('Failed to inject capture script. Please refresh the page.');
            resetCaptureButton();
            return;
          }
        }

        if (response && response.success) {
          showToast('Retweet captured!');
          await loadStats();
          await loadRetweets(searchInput ? searchInput.value.trim() : '', currentFilter);
        } else {
          showToast(response?.error || 'Failed to capture');
        }
      } catch (error) {
        console.error('Manual capture error:', error);
        showToast('No tweet found to capture');
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
