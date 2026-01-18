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

// ==================== STATE ====================

let currentView = 'archive';
let currentPage = 1;
let totalPages = 1;
let selectedIds = new Set();
let currentFilters = {};
let categories = {};
let allRetweets = [];
let viewMode = 'list';
let editingRetweetId = null;
let editingCategoryName = null;

// DOM Elements cache
const elements = {};

// ==================== INITIALIZATION ====================

async function init() {
  console.log('[Dashboard] Initializing...');

  try {
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
  elements.totalRetweets = document.getElementById('totalRetweets');
  elements.todayRetweets = document.getElementById('todayRetweets');
  elements.tagCloud = document.getElementById('tagCloud');
  elements.savedSearches = document.getElementById('savedSearches');
  elements.categoriesList = document.getElementById('categoriesList');
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
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

  // View toggle
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      viewMode = btn.dataset.view;
      renderResults();
    });
  });

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
      if (elements.totalRetweets) elements.totalRetweets.textContent = formatNumber(response.data.total);
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

function renderResults() {
  if (!elements.resultsList) return;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = allRetweets.slice(start, start + PAGE_SIZE);

  if (pageItems.length === 0) {
    if (elements.emptyState) elements.emptyState.hidden = false;
    elements.resultsList.innerHTML = '';
    return;
  }

  if (elements.emptyState) elements.emptyState.hidden = true;
  elements.resultsList.className = `results-list ${viewMode}`;

  elements.resultsList.innerHTML = pageItems.map(item => {
    const allTags = [...(item.tags || []), ...(item.auto_tags || [])];
    const initials = getInitials(item.user_name || item.user_handle);
    const isSelected = selectedIds.has(item.id);

    return `
      <div class="result-item ${isSelected ? 'selected' : ''}" data-id="${item.id}">
        <input type="checkbox" class="result-checkbox" ${isSelected ? 'checked' : ''}>
        <div class="result-avatar">${initials}</div>
        <div class="result-content">
          <div class="result-header">
            <span class="result-name">${escapeHtml(item.user_name || item.user_handle)}</span>
            <span class="result-handle">@${escapeHtml(item.user_handle || '')}</span>
            <span class="result-time">${formatDate(item.captured_at)}</span>
          </div>
          <div class="result-text">${escapeHtml(item.text || '')}</div>
          ${item.quoted_text ? `
            <div class="result-quoted">
              <div class="result-quoted-author">@${escapeHtml(item.quoted_author || '')}</div>
              <div>${escapeHtml(item.quoted_text)}</div>
            </div>
          ` : ''}
          ${item.media && item.media.length > 0 ? `
            <div class="result-media">
              ${item.media.map(m => m.thumb_url ? `<img src="${escapeHtml(m.thumb_url)}" alt="Media">` : '').join('')}
            </div>
          ` : ''}
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

function updateBulkActions() {
  const count = selectedIds.size;
  if (elements.bulkActions) elements.bulkActions.hidden = count === 0;
  if (elements.selectedCount) elements.selectedCount.textContent = count;
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
        ${retweet.media.map(m => m.url || m.thumb_url ? `
          <img src="${escapeHtml(m.url || m.thumb_url)}" alt="Media" style="max-width:100%;border-radius:12px;margin-bottom:8px">
        ` : '').join('')}
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
      <a href="${escapeHtml(retweet.source_url || '#')}" target="_blank" class="primary-btn">Open on X</a>
      <button class="secondary-btn" onclick="document.getElementById('detailModal').hidden=true; window.dashboardOpenTagModal('${id}')">Edit Tags</button>
    </div>
  `;

  modal.hidden = false;
}

// Expose for inline handler
window.dashboardOpenTagModal = openTagModal;

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
