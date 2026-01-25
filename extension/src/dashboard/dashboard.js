/**
 * Dashboard script for Retweet Filter
 * Self-contained without ES module imports for Chrome extension compatibility
 */

// ==================== INLINED CONSTANTS ====================

const MESSAGES = {
  CAPTURE_RETWEET: 'CAPTURE_RETWEET',
  GET_RETWEETS: 'GET_RETWEETS',
  SEARCH_RETWEETS: 'SEARCH_RETWEETS',
  UPDATE_TAGS: 'UPDATE_TAGS',
  DELETE_RETWEET: 'DELETE_RETWEET',
  IMPORT_DATA: 'IMPORT_DATA',
  EXPORT_DATA: 'EXPORT_DATA',
  GET_STATS: 'GET_STATS',
  GET_SETTINGS: 'GET_SETTINGS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  OPEN_DASHBOARD: 'OPEN_DASHBOARD'
};

const PAGE_SIZE = 50;

const DEFAULT_CATEGORIES = {
  'AI': ['artificial intelligence', 'machine learning', 'neural', 'GPT', 'LLM', 'deep learning', 'AI', 'openai', 'anthropic'],
  'Design': ['design', 'UI', 'UX', 'figma', 'typography', 'visual', 'aesthetic', 'interface', 'prototype'],
  'Language Models': ['GPT', 'Claude', 'LLM', 'transformer', 'chatgpt', 'llama', 'mistral', 'gemini'],
  'Programming': ['code', 'programming', 'javascript', 'python', 'rust', 'developer', 'API', 'typescript', 'react'],
  'Startups': ['startup', 'founder', 'YC', 'venture', 'fundraise', 'seed', 'series', 'investor'],
  'Science': ['research', 'paper', 'study', 'scientists', 'discovery', 'experiment', 'hypothesis']
};

// ==================== INLINED UTILITY FUNCTIONS ====================

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

function formatTimestamp(date) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
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

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

const TEXT_TRUNCATE_LENGTH = 50;

function truncateText(text, maxLength = TEXT_TRUNCATE_LENGTH) {
  if (!text || text.length <= maxLength) return { truncated: text || '', isTruncated: false };
  return { truncated: text.substring(0, maxLength) + '...', isTruncated: true, full: text };
}

// ==================== STATE ====================

let currentView = 'archive';
let currentPage = 1;
let totalPages = 1;
let selectedIds = new Set();
let currentFilters = {};
let categories = {};
let allRetweets = [];
let editingRetweetId = null;
let editingCategoryName = null;
let currentTheme = 'dark';
let currentLayout = 3;

// DOM Elements cache
const elements = {};

// ==================== INITIALIZATION ====================

async function init() {
  console.log('[Dashboard] Initializing...');

  try {
    loadTheme();
    loadLayout();
    cacheElements();
    setupEventListeners();
    await loadCategories();
    await loadStats();
    await loadRetweets();
    renderTagCloud();
    await loadSavedSearches();
    console.log('[Dashboard] Initialization complete');
  } catch (error) {
    console.error('[Dashboard] Init error:', error);
  }
}

// ==================== THEME ====================

function loadTheme() {
  const savedTheme = localStorage.getItem('rf-theme') || 'dark';
  currentTheme = savedTheme;
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  currentTheme = theme;
}

function toggleTheme() {
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
  localStorage.setItem('rf-theme', newTheme);
}

// ==================== LAYOUT ====================

function loadLayout() {
  const savedLayout = localStorage.getItem('rf-layout');
  if (savedLayout) {
    currentLayout = parseInt(savedLayout, 10);
    if (isNaN(currentLayout) || currentLayout < 1 || currentLayout > 6) {
      currentLayout = 3;
    }
  }
  applyLayout(currentLayout);
}

function applyLayout(cols) {
  currentLayout = cols;
  const resultsList = document.getElementById('resultsList');
  if (resultsList) {
    // Remove all existing column classes
    resultsList.classList.remove('cols-1', 'cols-2', 'cols-3', 'cols-4', 'cols-5', 'cols-6');
    // Add the new column class
    resultsList.classList.add(`cols-${cols}`);
  }

  // Update button active states
  const layoutSelector = document.getElementById('layoutSelector');
  if (layoutSelector) {
    layoutSelector.querySelectorAll('.layout-btn').forEach(btn => {
      const btnCols = parseInt(btn.dataset.cols, 10);
      btn.classList.toggle('active', btnCols === cols);
    });
  }
}

function setLayout(cols) {
  applyLayout(cols);
  localStorage.setItem('rf-layout', cols.toString());
}

function cacheElements() {
  elements.searchInput = document.getElementById('searchInput');
  elements.filterChips = document.getElementById('filterChips');
  elements.sourceFilter = document.getElementById('sourceFilter');
  elements.startDate = document.getElementById('startDate');
  elements.endDate = document.getElementById('endDate');
  elements.hasMediaFilter = document.getElementById('hasMediaFilter');
  elements.resultsList = document.getElementById('resultsList');
  elements.resultsContainer = document.getElementById('resultsContainer');
  elements.loading = document.getElementById('loading');
  elements.emptyState = document.getElementById('emptyState');
  elements.resultsCount = document.getElementById('resultsCount');
  elements.bulkActions = document.getElementById('bulkActions');
  elements.selectedCount = document.getElementById('selectedCount');
  elements.pagination = document.getElementById('pagination');
  elements.currentPage = document.getElementById('currentPage');
  elements.totalPages = document.getElementById('totalPages');
  elements.prevPage = document.getElementById('prevPage');
  elements.nextPage = document.getElementById('nextPage');
  elements.totalCount = document.getElementById('totalCount');
  elements.todayRetweets = document.getElementById('todayRetweets');
  elements.tagCloud = document.getElementById('tagCloud');
  elements.savedSearches = document.getElementById('savedSearches');
  elements.categoriesList = document.getElementById('categoriesList');
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
  // Theme toggle
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // Layout selector
  const layoutSelector = document.getElementById('layoutSelector');
  if (layoutSelector) {
    layoutSelector.querySelectorAll('.layout-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cols = parseInt(btn.dataset.cols, 10);
        if (cols >= 1 && cols <= 6) {
          setLayout(cols);
        }
      });
    });
  }

  // Navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Search
  if (elements.searchInput) {
    const debouncedSearch = debounce(() => loadRetweets(), 300);
    elements.searchInput.addEventListener('input', debouncedSearch);
  }

  // Save search button
  const saveSearchBtn = document.getElementById('saveSearch');
  if (saveSearchBtn) {
    saveSearchBtn.addEventListener('click', saveCurrentSearch);
  }

  // Platform filters
  const platformFilters = document.getElementById('platformFilters');
  if (platformFilters) {
    platformFilters.querySelectorAll('.platform-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Update active state
        platformFilters.querySelectorAll('.platform-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update filter
        const platform = btn.dataset.platform;
        if (platform) {
          currentFilters.platform = platform;
        } else {
          delete currentFilters.platform;
        }

        loadRetweets();
      });
    });
  }

  // Filters
  if (elements.sourceFilter) {
    elements.sourceFilter.addEventListener('change', () => {
      currentFilters.source = elements.sourceFilter.value || undefined;
      loadRetweets();
    });
  }

  if (elements.startDate) {
    elements.startDate.addEventListener('change', () => {
      currentFilters.startDate = elements.startDate.value || undefined;
      loadRetweets();
    });
  }

  if (elements.endDate) {
    elements.endDate.addEventListener('change', () => {
      currentFilters.endDate = elements.endDate.value || undefined;
      loadRetweets();
    });
  }

  if (elements.hasMediaFilter) {
    elements.hasMediaFilter.addEventListener('change', () => {
      currentFilters.hasMedia = elements.hasMediaFilter.checked ? true : undefined;
      loadRetweets();
    });
  }

  // Select All button
  const selectAllBtn = document.getElementById('selectAllBtn');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', selectAll);
  }

  // Pagination
  if (elements.prevPage) {
    elements.prevPage.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadRetweets();
      }
    });
  }

  if (elements.nextPage) {
    elements.nextPage.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        loadRetweets();
      }
    });
  }

  // Bulk actions
  const bulkTagBtn = document.getElementById('bulkTag');
  const bulkDeleteBtn = document.getElementById('bulkDelete');
  const clearSelectionBtn = document.getElementById('clearSelection');

  if (bulkTagBtn) bulkTagBtn.addEventListener('click', openBulkTagModal);
  if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', bulkDelete);
  if (clearSelectionBtn) clearSelectionBtn.addEventListener('click', clearSelection);

  // Categories
  const addCategoryBtn = document.getElementById('addCategory');
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener('click', () => openCategoryModal());
  }

  // Import handlers
  const archiveFileInput = document.getElementById('archiveFile');
  const csvFileInput = document.getElementById('csvFile');
  const importNitterBtn = document.getElementById('importNitter');

  if (archiveFileInput) archiveFileInput.addEventListener('change', handleArchiveImport);
  if (csvFileInput) csvFileInput.addEventListener('change', handleCsvImport);
  if (importNitterBtn) importNitterBtn.addEventListener('click', handleNitterImport);

  // File input trigger buttons (CSP-compliant alternative to inline onclick)
  const archiveFileBtn = document.getElementById('archiveFileBtn');
  const csvFileBtn = document.getElementById('csvFileBtn');
  if (archiveFileBtn && archiveFileInput) {
    archiveFileBtn.addEventListener('click', () => archiveFileInput.click());
  }
  if (csvFileBtn && csvFileInput) {
    csvFileBtn.addEventListener('click', () => csvFileInput.click());
  }

  // Handle image errors (CSP-compliant alternative to inline onerror)
  document.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG' && e.target.classList.contains('result-avatar-img')) {
      e.target.style.display = 'none';
      const fallback = e.target.nextElementSibling;
      if (fallback) fallback.style.display = 'flex';
    }
  }, true);

  // Settings
  const syncEnabledCheckbox = document.getElementById('syncEnabled');
  const exportDataBtn = document.getElementById('exportData');
  const clearDataBtn = document.getElementById('clearData');
  const autoTagEnabledCheckbox = document.getElementById('autoTagEnabled');

  if (syncEnabledCheckbox) {
    syncEnabledCheckbox.addEventListener('change', (e) => {
      const syncSettings = document.getElementById('syncSettings');
      if (syncSettings) syncSettings.hidden = !e.target.checked;
    });
  }

  if (exportDataBtn) exportDataBtn.addEventListener('click', exportData);
  if (clearDataBtn) clearDataBtn.addEventListener('click', clearAllData);

  if (autoTagEnabledCheckbox) {
    autoTagEnabledCheckbox.addEventListener('change', (e) => {
      chrome.runtime.sendMessage({
        type: MESSAGES.UPDATE_SETTINGS,
        data: { autoTagEnabled: e.target.checked }
      });
    });
  }

  // Modals
  const closeModalBtn = document.getElementById('closeModal');
  const detailModalBackdrop = document.querySelector('#detailModal .modal-backdrop');

  if (closeModalBtn) closeModalBtn.addEventListener('click', closeDetailModal);
  if (detailModalBackdrop) detailModalBackdrop.addEventListener('click', closeDetailModal);

  const cancelTagsBtn = document.getElementById('cancelTags');
  const tagModalBackdrop = document.querySelector('#tagModal .modal-backdrop');
  const saveTagsBtn = document.getElementById('saveTags');
  const addTagBtn = document.getElementById('addTagBtn');
  const newTagInput = document.getElementById('newTagInput');

  if (cancelTagsBtn) cancelTagsBtn.addEventListener('click', closeTagModal);
  if (tagModalBackdrop) tagModalBackdrop.addEventListener('click', closeTagModal);
  if (saveTagsBtn) saveTagsBtn.addEventListener('click', saveTags);
  if (addTagBtn) addTagBtn.addEventListener('click', addNewTag);
  if (newTagInput) {
    newTagInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addNewTag();
    });
  }

  const cancelCategoryBtn = document.getElementById('cancelCategory');
  const categoryModalBackdrop = document.querySelector('#categoryModal .modal-backdrop');
  const saveCategoryBtn = document.getElementById('saveCategory');

  if (cancelCategoryBtn) cancelCategoryBtn.addEventListener('click', closeCategoryModal);
  if (categoryModalBackdrop) categoryModalBackdrop.addEventListener('click', closeCategoryModal);
  if (saveCategoryBtn) saveCategoryBtn.addEventListener('click', saveCategory);

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);

  // Result clicks
  if (elements.resultsList) {
    elements.resultsList.addEventListener('click', handleResultClick);
  }
}

// ==================== VIEW SWITCHING ====================

function switchView(view) {
  currentView = view;

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `${view}View`);
  });

  if (view === 'categories') {
    renderCategories();
  }
}

// ==================== DATA LOADING ====================

async function loadStats() {
  try {
    const response = await chrome.runtime.sendMessage({ type: MESSAGES.GET_STATS });
    console.log('[Dashboard] Stats response:', response);

    if (response && response.success) {
      if (elements.totalCount) elements.totalCount.textContent = formatNumber(response.data.total);
      if (elements.todayRetweets) elements.todayRetweets.textContent = formatNumber(response.data.today);
    }
  } catch (error) {
    console.error('[Dashboard] loadStats error:', error);
  }
}

async function loadCategories() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CATEGORIES' });
    console.log('[Dashboard] Categories response:', response);

    if (response && response.success) {
      categories = response.data;
      renderFilterChips();
    } else {
      categories = DEFAULT_CATEGORIES;
      renderFilterChips();
    }
  } catch (error) {
    console.error('[Dashboard] loadCategories error:', error);
    categories = DEFAULT_CATEGORIES;
  }
}

async function loadRetweets() {
  if (elements.loading) elements.loading.hidden = false;
  if (elements.emptyState) elements.emptyState.hidden = true;
  if (elements.resultsList) elements.resultsList.innerHTML = '';

  const query = elements.searchInput ? elements.searchInput.value.trim() : '';

  try {
    let response;

    if (query) {
      response = await chrome.runtime.sendMessage({
        type: MESSAGES.SEARCH_RETWEETS,
        data: { query, filters: currentFilters }
      });

      if (response && response.success) {
        allRetweets = response.data.map(r => r.item);
        totalPages = Math.ceil(allRetweets.length / PAGE_SIZE);
      }
    } else if (Object.keys(currentFilters).length > 0) {
      response = await chrome.runtime.sendMessage({
        type: 'FILTER_RETWEETS',
        data: currentFilters
      });

      if (response && response.success) {
        allRetweets = response.data;
        totalPages = Math.ceil(allRetweets.length / PAGE_SIZE);
      }
    } else {
      response = await chrome.runtime.sendMessage({
        type: MESSAGES.GET_RETWEETS,
        data: { page: currentPage, pageSize: PAGE_SIZE }
      });

      if (response && response.success) {
        allRetweets = response.data.items || [];
        totalPages = response.data.totalPages || 1;
      }
    }

    console.log('[Dashboard] Retweets loaded:', allRetweets.length);

    if (response && response.success) {
      renderResults();
      updatePagination();
      if (elements.resultsCount) {
        elements.resultsCount.textContent = `${allRetweets.length} retweets`;
      }
    }
  } catch (error) {
    console.error('[Dashboard] loadRetweets error:', error);
  }

  if (elements.loading) elements.loading.hidden = true;
}

async function loadSavedSearches() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SAVED_SEARCHES' });

    if (response && response.success && elements.savedSearches) {
      elements.savedSearches.innerHTML = response.data.map(search => `
        <button class="saved-search-item" data-query="${escapeHtml(search.query)}" data-filters='${JSON.stringify(search.filters)}'>
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
          ${escapeHtml(search.name)}
        </button>
      `).join('');

      elements.savedSearches.querySelectorAll('.saved-search-item').forEach(btn => {
        btn.addEventListener('click', () => {
          if (elements.searchInput) elements.searchInput.value = btn.dataset.query;
          currentFilters = JSON.parse(btn.dataset.filters || '{}');
          loadRetweets();
        });
      });
    }
  } catch (error) {
    console.error('[Dashboard] loadSavedSearches error:', error);
  }
}

// ==================== RENDERING ====================

function renderFilterChips() {
  if (!elements.filterChips) return;

  const categoryNames = Object.keys(categories);

  elements.filterChips.innerHTML = categoryNames.map(name => `
    <button class="filter-chip ${currentFilters.tags?.includes(name) ? 'active' : ''}" data-tag="${escapeHtml(name)}">
      ${escapeHtml(name)}
    </button>
  `).join('');

  elements.filterChips.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag;

      if (!currentFilters.tags) currentFilters.tags = [];

      if (currentFilters.tags.includes(tag)) {
        currentFilters.tags = currentFilters.tags.filter(t => t !== tag);
        chip.classList.remove('active');
      } else {
        currentFilters.tags.push(tag);
        chip.classList.add('active');
      }

      if (currentFilters.tags.length === 0) {
        delete currentFilters.tags;
      }

      loadRetweets();
    });
  });
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
    return '<svg class="verified-badge gold" viewBox="0 0 22 22" width="18" height="18"><path fill="currentColor" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681.132-.637.075-1.299-.165-1.903.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/></svg>';
  }

  if (item.user_government) {
    return '<svg class="verified-badge gray" viewBox="0 0 22 22" width="18" height="18"><path fill="currentColor" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681.132-.637.075-1.299-.165-1.903.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/></svg>';
  }

  // Blue verified
  return '<svg class="verified-badge blue" viewBox="0 0 22 22" width="18" height="18"><path fill="currentColor" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681.132-.637.075-1.299-.165-1.903.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/></svg>';
}

function renderResults() {
  if (!elements.resultsList) return;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = allRetweets.slice(start, start + PAGE_SIZE);

  if (pageItems.length === 0) {
    if (elements.emptyState) elements.emptyState.hidden = false;
    elements.resultsList.innerHTML = '';
    updateBulkActions();
    return;
  }

  if (elements.emptyState) elements.emptyState.hidden = true;
  elements.resultsList.className = `results-list cols-${currentLayout}`;
  updateBulkActions();

  elements.resultsList.innerHTML = pageItems.map(item => {
    const allTags = [...(item.tags || []), ...(item.auto_tags || [])];
    const initials = getInitials(item.user_name || item.user_handle);
    const isSelected = selectedIds.has(item.id);
    const hasAvatar = item.user_avatar && item.user_avatar.length > 0;
    const verificationBadge = getVerificationBadge(item);

    // Format metrics
    const likes = formatMetric(item.like_count);
    const retweets = formatMetric(item.retweet_count);
    const replies = formatMetric(item.reply_count);
    const views = formatMetric(item.view_count);

    // Format date - prefer original tweet date
    const displayDate = item.original_created_at
      ? formatDate(item.original_created_at)
      : formatDate(item.captured_at);

    // Platform detection (default to twitter for backward compatibility)
    const platform = item.platform || 'twitter';
    const platformLabels = { twitter: 'X', instagram: 'IG', tiktok: 'TT', youtube: 'YT' };
    const platformBadge = `<span class="platform-badge ${platform}">${platformLabels[platform] || platform.toUpperCase().substring(0, 2)}</span>`;

    // Quote tweet rendering
    const quotedTweet = item.quoted_tweet || (item.quoted_text ? {
      text: item.quoted_text,
      author: { handle: item.quoted_author }
    } : null);

    // Text truncation
    const textTruncation = truncateText(item.text);

    return `
      <div class="result-item ${isSelected ? 'selected' : ''}" data-id="${item.id}" data-platform="${platform}">
        <input type="checkbox" class="result-checkbox" ${isSelected ? 'checked' : ''}>
        <div class="result-item-header">
          ${hasAvatar
        ? `<img class="result-avatar-img" src="${escapeHtml(item.user_avatar)}" alt="" data-fallback="${initials}"><div class="result-avatar" style="display:none">${initials}</div>`
        : `<div class="result-avatar">${initials}</div>`
      }
          <div class="result-content">
            <div class="result-header">
              <span class="result-name">${escapeHtml(item.user_name || item.user_handle)}</span>
              ${verificationBadge}
              ${platformBadge}
              <span class="result-handle">@${escapeHtml(item.user_handle || '')}</span>
              <span class="result-dot">·</span>
              <span class="result-time">${displayDate}</span>
            </div>
          </div>
        </div>
        <div class="result-text${textTruncation.isTruncated ? ' truncated' : ''}">
          <span class="result-text-content">${escapeHtml(textTruncation.truncated)}</span>
          <span class="result-text-full" hidden>${escapeHtml(textTruncation.full || '')}</span>
          ${textTruncation.isTruncated ? '<button class="read-more-btn" data-action="toggle-text">Read more</button>' : ''}
        </div>
        ${quotedTweet ? `
          <div class="result-quoted">
            <div class="result-quoted-header">
              ${quotedTweet.author?.avatar_url ? `<img class="quoted-avatar" src="${escapeHtml(quotedTweet.author.avatar_url)}" alt="">` : ''}
              <span class="quoted-name">${escapeHtml(quotedTweet.author?.name || '')}</span>
              ${quotedTweet.author?.is_verified ? '<svg class="verified-badge blue" viewBox="0 0 22 22" width="14" height="14"><path fill="currentColor" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681.132-.637.075-1.299-.165-1.903.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/></svg>' : ''}
              <span class="quoted-handle">@${escapeHtml(quotedTweet.author?.handle || '')}</span>
            </div>
            <div class="quoted-text">${escapeHtml(quotedTweet.text || '')}</div>
            ${quotedTweet.media && quotedTweet.media.length > 0 ? `
              <div class="quoted-media">
                ${quotedTweet.media.map(m => m.thumb_url ? `<img src="${escapeHtml(m.thumb_url)}" alt="Media">` : '').join('')}
              </div>
            ` : ''}
          </div>
        ` : ''}
        ${item.media && item.media.length > 0 ? `
          <div class="result-media">
            ${item.media.map(m => {
        if (m.type === 'video' || m.type === 'gif') {
          return `<div class="media-item video"><img src="${escapeHtml(m.thumb_url)}" alt="${m.type}"><span class="media-badge">${m.type === 'gif' ? 'GIF' : '▶'}</span></div>`;
        }
        return m.thumb_url ? `<img src="${escapeHtml(m.thumb_url)}" alt="Media">` : '';
      }).join('')}
          </div>
        ` : ''}
        ${item.card ? `
          <a class="result-card" href="${escapeHtml(item.card.url)}" target="_blank" rel="noopener">
            ${item.card.image_url ? `<img class="card-image" src="${escapeHtml(item.card.image_url)}" alt="">` : ''}
            <div class="card-info">
              <span class="card-domain">${escapeHtml(item.card.domain || '')}</span>
              <span class="card-title">${escapeHtml(item.card.title || '')}</span>
            </div>
          </a>
        ` : ''}
        <div class="result-metrics">
          ${item.platform === 'youtube' ? `
            ${views ? `<span class="metric" title="Views"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>${views}</span>` : ''}
            ${likes ? `<span class="metric" title="Likes"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1.91l-.01-.01L23 10z"/></svg>${likes}</span>` : ''}
          ` : item.platform === 'tiktok' || item.platform === 'instagram' ? `
            ${likes ? `<span class="metric" title="Likes"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>${likes}</span>` : ''}
            ${replies ? `<span class="metric" title="Comments"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"/></svg>${replies}</span>` : ''}
          ` : `
            ${retweets ? `<span class="metric" title="Retweets"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/></svg>${retweets}</span>` : ''}
            ${likes ? `<span class="metric" title="Likes"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/></svg>${likes}</span>` : ''}
            ${replies ? `<span class="metric" title="Replies"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.245c-4.421 0-8.005-3.58-8.005-8z"/></svg>${replies}</span>` : ''}
            ${views ? `<span class="metric" title="Views"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"/></svg>${views}</span>` : ''}
          `}
        </div>
        ${allTags.length > 0 ? `
          <div class="result-tags">
            ${allTags.map(tag => `
              <span class="result-tag ${item.auto_tags?.includes(tag) ? 'auto' : ''}">${escapeHtml(tag)}</span>
            `).join('')}
          </div>
        ` : ''}
        <div class="result-actions">
          <button class="result-action-btn" data-action="open" data-url="${escapeHtml(item.source_url || '')}">
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
            Open
          </button>
          <button class="result-action-btn" data-action="tags" data-id="${item.id}">
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z"/></svg>
            Tags
          </button>
          <button class="result-action-btn" data-action="delete" data-id="${item.id}">
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            Delete
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function renderTagCloud() {
  if (!elements.tagCloud) return;

  try {
    const response = await chrome.runtime.sendMessage({ type: MESSAGES.GET_STATS });

    if (response && response.success && response.data.byTag) {
      const tags = Object.entries(response.data.byTag)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);

      elements.tagCloud.innerHTML = tags.map(([tag, count]) => `
        <button class="tag-item" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
      `).join('');

      elements.tagCloud.querySelectorAll('.tag-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const tag = btn.dataset.tag;
          if (!currentFilters.tags) currentFilters.tags = [];

          if (currentFilters.tags.includes(tag)) {
            currentFilters.tags = currentFilters.tags.filter(t => t !== tag);
            btn.classList.remove('active');
          } else {
            currentFilters.tags.push(tag);
            btn.classList.add('active');
          }

          if (currentFilters.tags.length === 0) delete currentFilters.tags;
          loadRetweets();
        });
      });
    }
  } catch (error) {
    console.error('[Dashboard] renderTagCloud error:', error);
  }
}

function renderCategories() {
  if (!elements.categoriesList) return;

  elements.categoriesList.innerHTML = Object.entries(categories).map(([name, keywords]) => `
    <div class="category-card" data-name="${escapeHtml(name)}">
      <div class="category-header">
        <span class="category-name">${escapeHtml(name)}</span>
      </div>
      <div class="category-keywords">
        ${keywords.slice(0, 8).map(kw => `<span class="category-keyword">${escapeHtml(kw)}</span>`).join('')}
        ${keywords.length > 8 ? `<span class="category-keyword">+${keywords.length - 8} more</span>` : ''}
      </div>
      <div class="category-actions">
        <button class="secondary-btn" data-action="edit" data-name="${escapeHtml(name)}">Edit</button>
        <button class="danger-btn" data-action="delete" data-name="${escapeHtml(name)}">Delete</button>
      </div>
    </div>
  `).join('');

  elements.categoriesList.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openCategoryModal(btn.dataset.name));
  });

  elements.categoriesList.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteCategory(btn.dataset.name));
  });
}

function updatePagination() {
  if (elements.currentPage) elements.currentPage.textContent = currentPage;
  if (elements.totalPages) elements.totalPages.textContent = totalPages;
  if (elements.prevPage) elements.prevPage.disabled = currentPage <= 1;
  if (elements.nextPage) elements.nextPage.disabled = currentPage >= totalPages;
}

// ==================== EVENT HANDLERS ====================

function handleResultClick(e) {
  const item = e.target.closest('.result-item');
  if (!item) return;

  const id = item.dataset.id;

  // Checkbox
  if (e.target.classList.contains('result-checkbox')) {
    toggleSelection(id);
    return;
  }

  // Action buttons
  const actionBtn = e.target.closest('.result-action-btn');
  if (actionBtn) {
    const action = actionBtn.dataset.action;

    switch (action) {
      case 'open':
        if (actionBtn.dataset.url) {
          window.open(actionBtn.dataset.url, '_blank');
        }
        break;
      case 'tags':
        openTagModal(actionBtn.dataset.id);
        break;
      case 'delete':
        deleteRetweet(actionBtn.dataset.id);
        break;
    }
    return;
  }

  // Read more toggle
  const readMoreBtn = e.target.closest('.read-more-btn');
  if (readMoreBtn) {
    const textContainer = readMoreBtn.closest('.result-text');
    const truncatedSpan = textContainer.querySelector('.result-text-content');
    const fullSpan = textContainer.querySelector('.result-text-full');

    if (fullSpan.hidden) {
      // Expand
      truncatedSpan.hidden = true;
      fullSpan.hidden = false;
      readMoreBtn.textContent = 'Show less';
      textContainer.classList.remove('truncated');
      textContainer.classList.add('expanded');
    } else {
      // Collapse
      truncatedSpan.hidden = false;
      fullSpan.hidden = true;
      readMoreBtn.textContent = 'Read more';
      textContainer.classList.remove('expanded');
      textContainer.classList.add('truncated');
    }
    return;
  }

  // Click on item itself - open detail modal
  openDetailModal(id);
}

function handleKeyboard(e) {
  // Escape to close modals
  if (e.key === 'Escape') {
    closeDetailModal();
    closeTagModal();
    closeCategoryModal();
  }

  // Ctrl/Cmd + K to focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (elements.searchInput) elements.searchInput.focus();
  }

  // Ctrl/Cmd + A to select all (when not in input)
  if ((e.ctrlKey || e.metaKey) && e.key === 'a' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    allRetweets.forEach(r => selectedIds.add(r.id));
    updateBulkActions();
    renderResults();
  }
}

// ==================== SELECTION ====================

function toggleSelection(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }

  updateBulkActions();
  renderResults();
}

function selectAll() {
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = allRetweets.slice(start, start + PAGE_SIZE);

  // If all current page items are selected, deselect all
  const allSelected = pageItems.every(item => selectedIds.has(item.id));

  if (allSelected) {
    pageItems.forEach(item => selectedIds.delete(item.id));
  } else {
    pageItems.forEach(item => selectedIds.add(item.id));
  }

  updateBulkActions();
  renderResults();
}

function updateBulkActions() {
  const count = selectedIds.size;
  const hasSelection = count > 0;

  // Update selection count
  if (elements.selectedCount) elements.selectedCount.textContent = count;

  // Show/hide bulk action buttons based on selection
  const bulkTagBtn = document.getElementById('bulkTag');
  const bulkDeleteBtn = document.getElementById('bulkDelete');
  const clearSelectionBtn = document.getElementById('clearSelection');
  const selectionInfo = document.getElementById('selectionInfo');

  if (bulkTagBtn) bulkTagBtn.hidden = !hasSelection;
  if (bulkDeleteBtn) bulkDeleteBtn.hidden = !hasSelection;
  if (clearSelectionBtn) clearSelectionBtn.hidden = !hasSelection;
  if (selectionInfo) selectionInfo.style.opacity = hasSelection ? '1' : '0.5';

  // Update Select All button text
  const selectAllBtn = document.getElementById('selectAllBtn');
  if (selectAllBtn) {
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = allRetweets.slice(start, start + PAGE_SIZE);
    const allSelected = pageItems.length > 0 && pageItems.every(item => selectedIds.has(item.id));
    selectAllBtn.innerHTML = allSelected
      ? `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg> Deselect All`
      : `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg> Select All`;
  }
}

function clearSelection() {
  selectedIds.clear();
  updateBulkActions();
  renderResults();
}

// ==================== SEARCH ====================

async function saveCurrentSearch() {
  const query = elements.searchInput ? elements.searchInput.value.trim() : '';
  if (!query && Object.keys(currentFilters).length === 0) return;

  const name = prompt('Name for this search:', query || 'Saved Search');
  if (!name) return;

  await chrome.runtime.sendMessage({
    type: 'SAVE_SEARCH',
    data: { name, query, filters: currentFilters }
  });

  loadSavedSearches();
}

// ==================== CATEGORIES ====================

function openCategoryModal(name = null) {
  editingCategoryName = name;
  const modal = document.getElementById('categoryModal');
  const titleEl = document.getElementById('categoryModalTitle');
  const nameInput = document.getElementById('categoryName');
  const keywordsInput = document.getElementById('categoryKeywords');

  if (!modal || !nameInput || !keywordsInput) return;

  if (name && categories[name]) {
    if (titleEl) titleEl.textContent = 'Edit Category';
    nameInput.value = name;
    keywordsInput.value = categories[name].join('\n');
  } else {
    if (titleEl) titleEl.textContent = 'Add Category';
    nameInput.value = '';
    keywordsInput.value = '';
  }

  modal.hidden = false;
}

function closeCategoryModal() {
  const modal = document.getElementById('categoryModal');
  if (modal) modal.hidden = true;
  editingCategoryName = null;
}

async function saveCategory() {
  const nameInput = document.getElementById('categoryName');
  const keywordsInput = document.getElementById('categoryKeywords');

  if (!nameInput || !keywordsInput) return;

  const name = nameInput.value.trim();
  const keywords = keywordsInput.value
    .split('\n')
    .map(k => k.trim())
    .filter(k => k.length > 0);

  if (!name || keywords.length === 0) {
    alert('Please enter a name and at least one keyword');
    return;
  }

  try {
    // Delete old if renaming
    if (editingCategoryName && editingCategoryName !== name) {
      await chrome.runtime.sendMessage({
        type: 'DELETE_CATEGORY',
        data: { name: editingCategoryName }
      });
    }

    const response = await chrome.runtime.sendMessage({
      type: 'SET_CATEGORY',
      data: { name, keywords }
    });

    console.log('[Dashboard] Save category response:', response);

    await loadCategories();
    renderCategories();
    closeCategoryModal();
  } catch (error) {
    console.error('[Dashboard] saveCategory error:', error);
    alert('Failed to save category: ' + error.message);
  }
}

async function deleteCategory(name) {
  if (!confirm(`Delete category "${name}"?`)) return;

  try {
    await chrome.runtime.sendMessage({
      type: 'DELETE_CATEGORY',
      data: { name }
    });

    await loadCategories();
    renderCategories();
  } catch (error) {
    console.error('[Dashboard] deleteCategory error:', error);
  }
}

// ==================== TAG MODAL ====================

async function openTagModal(id) {
  editingRetweetId = id;
  const retweet = allRetweets.find(r => r.id === id);
  if (!retweet) return;

  const modal = document.getElementById('tagModal');
  const currentTagsEl = document.getElementById('currentTags');
  const suggestedTagsEl = document.getElementById('suggestedTags');

  if (!modal || !currentTagsEl || !suggestedTagsEl) return;

  // Render current tags
  const allTags = [...(retweet.tags || []), ...(retweet.auto_tags || [])];
  currentTagsEl.innerHTML = allTags.map(tag => `
    <span class="current-tag ${retweet.auto_tags?.includes(tag) ? 'auto' : ''}">
      ${escapeHtml(tag)}
      <button class="remove-tag" data-tag="${escapeHtml(tag)}">×</button>
    </span>
  `).join('');

  currentTagsEl.querySelectorAll('.remove-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.parentElement.remove();
    });
  });

  // Render suggested tags from categories
  const categoryNames = Object.keys(categories).filter(c => !allTags.includes(c));
  suggestedTagsEl.innerHTML = categoryNames.length > 0 ? `
    <h4>Suggestions</h4>
    <div class="suggested-tags-list">
      ${categoryNames.map(c => `<button class="suggested-tag" data-tag="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
    </div>
  ` : '';

  suggestedTagsEl.querySelectorAll('.suggested-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      const tagEl = document.createElement('span');
      tagEl.className = 'current-tag';
      tagEl.innerHTML = `${escapeHtml(tag)}<button class="remove-tag" data-tag="${escapeHtml(tag)}">×</button>`;
      tagEl.querySelector('.remove-tag').addEventListener('click', () => tagEl.remove());
      currentTagsEl.appendChild(tagEl);
      btn.remove();
    });
  });

  modal.hidden = false;
}

function closeTagModal() {
  const modal = document.getElementById('tagModal');
  if (modal) modal.hidden = true;
  editingRetweetId = null;
}

function addNewTag() {
  const input = document.getElementById('newTagInput');
  const currentTagsEl = document.getElementById('currentTags');

  if (!input || !currentTagsEl) return;

  const tag = input.value.trim();
  if (!tag) return;

  const tagEl = document.createElement('span');
  tagEl.className = 'current-tag';
  tagEl.innerHTML = `${escapeHtml(tag)}<button class="remove-tag" data-tag="${escapeHtml(tag)}">×</button>`;
  tagEl.querySelector('.remove-tag').addEventListener('click', () => tagEl.remove());
  currentTagsEl.appendChild(tagEl);

  input.value = '';
}

async function saveTags() {
  if (!editingRetweetId) return;

  const currentTagsEl = document.getElementById('currentTags');
  if (!currentTagsEl) return;

  const tags = Array.from(currentTagsEl.querySelectorAll('.current-tag'))
    .map(el => el.textContent.trim().replace('×', '').trim())
    .filter(t => t.length > 0);

  try {
    await chrome.runtime.sendMessage({
      type: MESSAGES.UPDATE_TAGS,
      data: { id: editingRetweetId, tags }
    });

    closeTagModal();
    loadRetweets();
  } catch (error) {
    console.error('[Dashboard] saveTags error:', error);
  }
}

function openBulkTagModal() {
  if (selectedIds.size === 0) return;

  editingRetweetId = 'bulk';

  const modal = document.getElementById('tagModal');
  const currentTagsEl = document.getElementById('currentTags');
  const suggestedTagsEl = document.getElementById('suggestedTags');

  if (!modal || !currentTagsEl || !suggestedTagsEl) return;

  currentTagsEl.innerHTML = '';
  suggestedTagsEl.innerHTML = `
    <h4>Add tags to ${selectedIds.size} items</h4>
    <div class="suggested-tags-list">
      ${Object.keys(categories).map(c => `<button class="suggested-tag" data-tag="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
    </div>
  `;

  suggestedTagsEl.querySelectorAll('.suggested-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      const tagEl = document.createElement('span');
      tagEl.className = 'current-tag';
      tagEl.innerHTML = `${escapeHtml(tag)}<button class="remove-tag" data-tag="${escapeHtml(tag)}">×</button>`;
      tagEl.querySelector('.remove-tag').addEventListener('click', () => tagEl.remove());
      currentTagsEl.appendChild(tagEl);
    });
  });

  // Override save for bulk
  const saveBtn = document.getElementById('saveTags');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const tags = Array.from(currentTagsEl.querySelectorAll('.current-tag'))
        .map(el => el.textContent.trim().replace('×', '').trim())
        .filter(t => t.length > 0);

      await chrome.runtime.sendMessage({
        type: 'BULK_UPDATE_TAGS',
        data: {
          ids: Array.from(selectedIds),
          tagsToAdd: tags,
          tagsToRemove: []
        }
      });

      closeTagModal();
      clearSelection();
      loadRetweets();
    };
  }

  modal.hidden = false;
}

// ==================== DELETE ====================

async function deleteRetweet(id) {
  if (!confirm('Delete this retweet?')) return;

  try {
    await chrome.runtime.sendMessage({
      type: MESSAGES.DELETE_RETWEET,
      data: { id }
    });

    loadRetweets();
    loadStats();
  } catch (error) {
    console.error('[Dashboard] deleteRetweet error:', error);
  }
}

async function bulkDelete() {
  if (selectedIds.size === 0) return;
  if (!confirm(`Delete ${selectedIds.size} retweets?`)) return;

  try {
    await chrome.runtime.sendMessage({
      type: 'BULK_DELETE',
      data: { ids: Array.from(selectedIds) }
    });

    clearSelection();
    loadRetweets();
    loadStats();
  } catch (error) {
    console.error('[Dashboard] bulkDelete error:', error);
  }
}

// ==================== DETAIL MODAL ====================

function openDetailModal(id) {
  const retweet = allRetweets.find(r => r.id === id);
  if (!retweet) return;

  const modal = document.getElementById('detailModal');
  const body = document.getElementById('modalBody');

  if (!modal || !body) return;

  const allTags = [...(retweet.tags || []), ...(retweet.auto_tags || [])];

  body.innerHTML = `
    <div class="detail-header">
      <div class="result-avatar" style="width:56px;height:56px;font-size:22px">${getInitials(retweet.user_name || retweet.user_handle)}</div>
      <div>
        <div class="result-name" style="font-size:18px">${escapeHtml(retweet.user_name || retweet.user_handle)}</div>
        <div class="result-handle">@${escapeHtml(retweet.user_handle || '')}</div>
      </div>
    </div>
    <div class="detail-text" style="font-size:17px;margin:20px 0;line-height:1.6">${escapeHtml(retweet.text || '')}</div>
    ${retweet.quoted_text ? `
      <div class="result-quoted" style="margin-bottom:16px">
        <div class="result-quoted-author">@${escapeHtml(retweet.quoted_author || '')}</div>
        <div>${escapeHtml(retweet.quoted_text)}</div>
      </div>
    ` : ''}
    ${retweet.media && retweet.media.length > 0 ? `
      <div class="detail-media" style="margin-bottom:16px">
        ${retweet.media.map(m => {
    // Determine best image source: thumb_url usually safer for videos/GIFs
    const src = (m.type === 'video' || m.type === 'gif') ? (m.thumb_url || m.url) : (m.url || m.thumb_url);
    const isVideo = m.type === 'video' || m.type === 'gif';

    if (!src) return '';

    return `
            <div style="position:relative;display:inline-block;max-width:100%;margin-bottom:8px">
              <img src="${escapeHtml(src)}" alt="${m.type || 'Media'}" style="max-width:100%;border-radius:12px;display:block">
              ${isVideo ? `
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:48px;height:48px;background:rgba(0,0,0,0.6);border-radius:50%;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)">
                  <svg viewBox="0 0 24 24" width="24" height="24" style="color:white;fill:currentColor"><path d="M8 5v14l11-7z"/></svg>
                </div>
              ` : ''}
            </div>
          `;
  }).join('')}
      </div>
    ` : ''}
    <div class="detail-meta" style="color:var(--text-secondary);font-size:14px;margin-bottom:16px">
      Captured: ${formatTimestamp(retweet.captured_at)}<br>
      Source: ${retweet.source || 'browser'}
    </div>
    ${allTags.length > 0 ? `
      <div class="result-tags" style="margin-bottom:16px">
        ${allTags.map(tag => `<span class="result-tag ${retweet.auto_tags?.includes(tag) ? 'auto' : ''}">${escapeHtml(tag)}</span>`).join('')}
      </div>
    ` : ''}
    <div style="display:flex;gap:12px">
      <a href="${escapeHtml(retweet.source_url || '#')}" target="_blank" class="primary-btn">Open on ${retweet.platform === 'instagram' ? 'Instagram' : retweet.platform === 'tiktok' ? 'TikTok' : retweet.platform === 'youtube' ? 'YouTube' : 'X'}</a>
      <button class="secondary-btn" id="editTagsBtn" data-id="${id}">Edit Tags</button>
    </div>
  `;

  modal.hidden = false;

  // Add event listener for edit tags button
  const editTagsBtn = document.getElementById('editTagsBtn');
  if (editTagsBtn) {
    editTagsBtn.addEventListener('click', () => {
      modal.hidden = true;
      openTagModal(editTagsBtn.dataset.id);
    });
  }
}

function closeDetailModal() {
  const modal = document.getElementById('detailModal');
  if (modal) modal.hidden = true;
}

// ==================== IMPORT ====================

async function handleArchiveImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  showImportProgress();

  try {
    const text = await file.text();

    const response = await chrome.runtime.sendMessage({
      type: MESSAGES.IMPORT_DATA,
      data: { type: 'archive', data: text }
    });

    showImportResults(response);
  } catch (error) {
    console.error('[Dashboard] Archive import error:', error);
    showImportResults({ success: false, error: error.message });
  }

  e.target.value = '';
}

async function handleCsvImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  showImportProgress();

  try {
    const text = await file.text();

    const response = await chrome.runtime.sendMessage({
      type: MESSAGES.IMPORT_DATA,
      data: { type: 'csv', data: text }
    });

    showImportResults(response);
  } catch (error) {
    console.error('[Dashboard] CSV import error:', error);
    showImportResults({ success: false, error: error.message });
  }

  e.target.value = '';
}

async function handleNitterImport() {
  const urlInput = document.getElementById('nitterUrl');
  const url = urlInput ? urlInput.value.trim() : '';
  if (!url) return;

  showImportProgress();

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGES.IMPORT_DATA,
      data: { type: 'nitter', data: url }
    });

    showImportResults(response);
  } catch (error) {
    console.error('[Dashboard] Nitter import error:', error);
    showImportResults({ success: false, error: error.message });
  }
}

function showImportProgress() {
  const progressEl = document.getElementById('importProgress');
  const resultsEl = document.getElementById('importResults');
  const fillEl = document.getElementById('progressFill');
  const textEl = document.getElementById('progressText');

  if (progressEl) progressEl.hidden = false;
  if (resultsEl) resultsEl.hidden = true;
  if (fillEl) fillEl.style.width = '50%';
  if (textEl) textEl.textContent = 'Importing...';
}

function showImportResults(response) {
  const progressEl = document.getElementById('importProgress');
  const resultsEl = document.getElementById('importResults');

  if (progressEl) progressEl.hidden = true;
  if (resultsEl) resultsEl.hidden = false;

  if (response && response.success) {
    const importedCountEl = document.getElementById('importedCount');
    const duplicateCountEl = document.getElementById('duplicateCount');

    if (importedCountEl) importedCountEl.textContent = response.data.added;
    if (duplicateCountEl) duplicateCountEl.textContent = response.data.duplicates;

    loadStats();
    loadRetweets();
  } else if (resultsEl) {
    resultsEl.innerHTML = `
      <h3 style="color:var(--error)">Import Failed</h3>
      <p>${escapeHtml(response?.error || 'Unknown error')}</p>
    `;
  }
}

// ==================== EXPORT/CLEAR ====================

async function exportData() {
  try {
    const response = await chrome.runtime.sendMessage({ type: MESSAGES.EXPORT_DATA });

    if (response && response.success) {
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `retweet-filter-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('[Dashboard] Export error:', error);
  }
}

async function clearAllData() {
  if (!confirm('This will delete ALL your captured retweets. Are you sure?')) return;
  if (!confirm('This cannot be undone. Continue?')) return;

  try {
    // Export first as backup
    const response = await chrome.runtime.sendMessage({ type: MESSAGES.EXPORT_DATA });
    if (response && response.success) {
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `retweet-filter-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    alert('Data export downloaded. To clear data, uninstall and reinstall the extension.');
  } catch (error) {
    console.error('[Dashboard] Clear data error:', error);
  }
}

// ==================== INITIALIZE ====================

document.addEventListener('DOMContentLoaded', init);
