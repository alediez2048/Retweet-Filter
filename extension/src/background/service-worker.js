/**
 * Service Worker for Retweet Filter Extension
 * Self-contained without ES module imports for Chrome extension compatibility
 */

// ==================== CONSTANTS ====================

const DB_NAME = 'RetweetFilterDB';
const DB_VERSION = 1;

const STORES = {
  RETWEETS: 'retweets',
  SETTINGS: 'settings',
  SAVED_SEARCHES: 'savedSearches',
  CATEGORIES: 'categories'
};

const SOURCES = {
  BROWSER: 'browser',
  ARCHIVE: 'archive',
  NITTER: 'nitter',
  CSV: 'csv',
  MANUAL: 'manual'
};

const DEFAULT_CATEGORIES = {
  'AI': [
    'artificial intelligence', 'machine learning', 'neural', 'GPT', 'LLM',
    'deep learning', 'AI', 'openai', 'anthropic', 'model', 'training',
    'inference', 'embeddings', 'vector', 'RAG'
  ],
  'Design': [
    'design', 'UI', 'UX', 'figma', 'typography', 'visual', 'aesthetic',
    'interface', 'prototype', 'wireframe', 'mockup', 'layout', 'color',
    'brand', 'logo', 'graphic'
  ],
  'Language Models': [
    'GPT', 'Claude', 'LLM', 'transformer', 'chatgpt', 'llama', 'mistral',
    'gemini', 'palm', 'bert', 'token', 'prompt', 'fine-tune', 'RLHF',
    'context window', 'completion'
  ],
  'Programming': [
    'code', 'programming', 'javascript', 'python', 'rust', 'developer',
    'API', 'typescript', 'react', 'node', 'database', 'backend', 'frontend',
    'git', 'deploy', 'docker', 'kubernetes', 'serverless'
  ],
  'Startups': [
    'startup', 'founder', 'YC', 'venture', 'fundraise', 'seed', 'series',
    'investor', 'pitch', 'MVP', 'product-market fit', 'growth', 'scale',
    'acquisition', 'IPO', 'valuation'
  ],
  'Science': [
    'research', 'paper', 'study', 'scientists', 'discovery', 'experiment',
    'hypothesis', 'data', 'analysis', 'peer-review', 'journal', 'citation',
    'breakthrough', 'innovation'
  ]
};

const MESSAGES = {
  CAPTURE_RETWEET: 'CAPTURE_RETWEET',
  GET_RETWEETS: 'GET_RETWEETS',
  SEARCH_RETWEETS: 'SEARCH_RETWEETS',
  UPDATE_TAGS: 'UPDATE_TAGS',
  DELETE_RETWEET: 'DELETE_RETWEET',
  IMPORT_DATA: 'IMPORT_DATA',
  EXPORT_DATA: 'EXPORT_DATA',
  GET_STATS: 'GET_STATS',
  SYNC_NOW: 'SYNC_NOW',
  GET_SETTINGS: 'GET_SETTINGS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  OPEN_DASHBOARD: 'OPEN_DASHBOARD'
};

const SEARCH_OPTIONS = {
  keys: ['text', 'quoted_text', 'user_handle', 'user_name', 'quoted_author'],
  threshold: 0.3,
  ignoreLocation: true,
  includeScore: true,
  includeMatches: true
};

// ==================== UTILITY FUNCTIONS ====================

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==================== TAGGER FUNCTIONS ====================

function suggestTags(text, categories = DEFAULT_CATEGORIES) {
  if (!text) return [];

  const textLower = text.toLowerCase();
  const suggestions = [];

  for (const [category, keywords] of Object.entries(categories)) {
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
      if (regex.test(textLower)) {
        if (!suggestions.includes(category)) {
          suggestions.push(category);
        }
        break;
      }
    }
  }

  return suggestions;
}

// ==================== SEARCH FUNCTIONS ====================

function fuzzyMatch(text, pattern) {
  if (!text || !pattern) return null;

  const textLower = text.toLowerCase();
  const patternLower = pattern.toLowerCase();

  const exactIndex = textLower.indexOf(patternLower);
  if (exactIndex !== -1) {
    return {
      score: 0,
      indices: [[exactIndex, exactIndex + pattern.length - 1]]
    };
  }

  let patternIdx = 0;
  let textIdx = 0;
  const indices = [];
  let score = 0;

  while (textIdx < text.length && patternIdx < pattern.length) {
    if (textLower[textIdx] === patternLower[patternIdx]) {
      indices.push([textIdx, textIdx]);
      patternIdx++;
    } else {
      score += 0.1;
    }
    textIdx++;
  }

  if (patternIdx === pattern.length) {
    return { score, indices };
  }

  return null;
}

function searchRetweets(retweets, query, filters = {}) {
  let results = [...retweets];

  // Apply filters first
  results = results.filter(retweet => {
    if (filters.tags && filters.tags.length > 0) {
      const allTags = [...(retweet.tags || []), ...(retweet.auto_tags || [])];
      const hasMatchingTag = filters.tags.some(tag =>
        allTags.some(t => t.toLowerCase() === tag.toLowerCase())
      );
      if (!hasMatchingTag) return false;
    }

    if (filters.startDate) {
      const capturedDate = new Date(retweet.captured_at);
      const startDate = new Date(filters.startDate);
      startDate.setHours(0, 0, 0, 0);
      if (capturedDate < startDate) return false;
    }

    if (filters.endDate) {
      const capturedDate = new Date(retweet.captured_at);
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      if (capturedDate > endDate) return false;
    }

    if (filters.source && retweet.source !== filters.source) {
      return false;
    }

    if (filters.hasMedia !== undefined) {
      const hasMedia = retweet.media && retweet.media.length > 0;
      if (filters.hasMedia !== hasMedia) return false;
    }

    if (filters.author) {
      const authorLower = filters.author.toLowerCase();
      if (!retweet.user_handle.toLowerCase().includes(authorLower) &&
          !retweet.user_name.toLowerCase().includes(authorLower)) {
        return false;
      }
    }

    return true;
  });

  if (!query || query.trim() === '') {
    return results.map(item => ({
      item,
      score: 0,
      matches: []
    })).sort((a, b) => new Date(b.item.captured_at) - new Date(a.item.captured_at));
  }

  const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  const searchResults = [];

  for (const retweet of results) {
    let totalScore = 0;
    let matchCount = 0;
    const matches = [];

    for (const term of searchTerms) {
      for (const key of SEARCH_OPTIONS.keys) {
        const value = retweet[key];
        if (!value) continue;

        const match = fuzzyMatch(value, term);
        if (match && match.score <= SEARCH_OPTIONS.threshold) {
          totalScore += match.score;
          matchCount++;
          matches.push({
            key,
            indices: match.indices,
            value
          });
        }
      }
    }

    if (matchCount > 0) {
      searchResults.push({
        item: retweet,
        score: totalScore / matchCount,
        matches
      });
    }
  }

  searchResults.sort((a, b) => {
    if (Math.abs(a.score - b.score) < 0.1) {
      return new Date(b.item.captured_at) - new Date(a.item.captured_at);
    }
    return a.score - b.score;
  });

  return searchResults;
}

// ==================== DATABASE CLASS ====================

class RetweetDB {
  constructor() {
    this.db = null;
    this.dbReady = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(STORES.RETWEETS)) {
          const retweetsStore = db.createObjectStore(STORES.RETWEETS, { keyPath: 'id' });
          retweetsStore.createIndex('tweet_id', 'tweet_id', { unique: false });
          retweetsStore.createIndex('user_handle', 'user_handle', { unique: false });
          retweetsStore.createIndex('captured_at', 'captured_at', { unique: false });
          retweetsStore.createIndex('source', 'source', { unique: false });
          retweetsStore.createIndex('tweet_id_source', ['tweet_id', 'source'], { unique: true });
        }

        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains(STORES.SAVED_SEARCHES)) {
          const searchesStore = db.createObjectStore(STORES.SAVED_SEARCHES, { keyPath: 'id' });
          searchesStore.createIndex('created_at', 'created_at', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
          db.createObjectStore(STORES.CATEGORIES, { keyPath: 'name' });
        }
      };
    });
  }

  async ready() {
    await this.dbReady;
    return this.db;
  }

  async addRetweet(retweet) {
    await this.ready();

    const record = {
      id: generateId(),
      tweet_id: retweet.tweet_id,

      // Author information (enhanced)
      user_handle: retweet.user_handle || '',
      user_name: retweet.user_name || '',
      user_avatar: retweet.user_avatar || '',
      user_verified: retweet.user_verified || false,
      user_blue_verified: retweet.user_blue_verified || false,
      user_business: retweet.user_business || false,
      user_government: retweet.user_government || false,

      // Content
      text: retweet.text || '',

      // Entities
      urls: retweet.urls || [],
      hashtags: retweet.hashtags || [],
      mentions: retweet.mentions || [],

      // Engagement metrics
      reply_count: retweet.reply_count || 0,
      retweet_count: retweet.retweet_count || 0,
      like_count: retweet.like_count || 0,
      view_count: retweet.view_count || 0,
      bookmark_count: retweet.bookmark_count || 0,

      // Quote tweet (enhanced)
      quoted_tweet: retweet.quoted_tweet || null,
      // Legacy fields for backward compatibility
      quoted_text: retweet.quoted_text || retweet.quoted_tweet?.text || '',
      quoted_author: retweet.quoted_author || retweet.quoted_tweet?.author?.handle || '',

      // Media
      media: retweet.media || [],

      // Card/link preview
      card: retweet.card || null,

      // Reply info
      is_reply: retweet.is_reply || false,
      reply_to: retweet.reply_to || null,

      // Timestamps
      captured_at: retweet.captured_at || new Date().toISOString(),
      original_created_at: retweet.original_created_at || null,

      // Tags
      tags: retweet.tags || [],
      auto_tags: retweet.auto_tags || [],

      // Source
      source: retweet.source || 'browser',
      source_url: retweet.source_url || '',

      // Status
      is_available: true,
      raw_payload: retweet.raw_payload || null,
      synced_at: null
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.RETWEETS], 'readwrite');
      const store = transaction.objectStore(STORES.RETWEETS);
      const request = store.add(record);

      request.onsuccess = () => resolve(record);
      request.onerror = () => {
        if (request.error?.name === 'ConstraintError') {
          resolve(null);
        } else {
          reject(request.error);
        }
      };
    });
  }

  async addRetweets(retweets) {
    await this.ready();

    let added = 0;
    let duplicates = 0;
    const results = [];

    for (const retweet of retweets) {
      try {
        const result = await this.addRetweet(retweet);
        if (result) {
          added++;
          results.push(result);
        } else {
          duplicates++;
        }
      } catch (error) {
        duplicates++;
      }
    }

    return { added, duplicates, results };
  }

  async getRetweet(id) {
    await this.ready();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.RETWEETS], 'readonly');
      const store = transaction.objectStore(STORES.RETWEETS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getRetweets({ page = 1, pageSize = 50, sortBy = 'captured_at', sortOrder = 'desc' } = {}) {
    await this.ready();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.RETWEETS], 'readonly');
      const store = transaction.objectStore(STORES.RETWEETS);
      const items = [];

      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          items.sort((a, b) => {
            const aVal = a[sortBy];
            const bVal = b[sortBy];
            const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return sortOrder === 'desc' ? -comparison : comparison;
          });

          const start = (page - 1) * pageSize;
          const paginatedItems = items.slice(start, start + pageSize);

          resolve({
            items: paginatedItems,
            total: items.length,
            page,
            pageSize,
            totalPages: Math.ceil(items.length / pageSize)
          });
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getAllRetweets() {
    await this.ready();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.RETWEETS], 'readonly');
      const store = transaction.objectStore(STORES.RETWEETS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async updateRetweet(id, updates) {
    await this.ready();

    const existing = await this.getRetweet(id);
    if (!existing) throw new Error('Retweet not found');

    const updated = { ...existing, ...updates };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.RETWEETS], 'readwrite');
      const store = transaction.objectStore(STORES.RETWEETS);
      const request = store.put(updated);

      request.onsuccess = () => resolve(updated);
      request.onerror = () => reject(request.error);
    });
  }

  async updateTags(id, tags) {
    return this.updateRetweet(id, { tags });
  }

  async bulkUpdateTags(ids, tagsToAdd = [], tagsToRemove = []) {
    await this.ready();
    let updated = 0;

    for (const id of ids) {
      const retweet = await this.getRetweet(id);
      if (retweet) {
        let newTags = [...retweet.tags];
        newTags = newTags.filter(tag => !tagsToRemove.includes(tag));

        for (const tag of tagsToAdd) {
          if (!newTags.includes(tag)) {
            newTags.push(tag);
          }
        }

        await this.updateTags(id, newTags);
        updated++;
      }
    }

    return updated;
  }

  async deleteRetweet(id) {
    await this.ready();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.RETWEETS], 'readwrite');
      const store = transaction.objectStore(STORES.RETWEETS);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteRetweets(ids) {
    let deleted = 0;
    for (const id of ids) {
      try {
        await this.deleteRetweet(id);
        deleted++;
      } catch (error) {
        console.error('Failed to delete retweet:', id, error);
      }
    }
    return deleted;
  }

  async filterRetweets(filters = {}) {
    const all = await this.getAllRetweets();

    return all.filter(retweet => {
      if (filters.tags && filters.tags.length > 0) {
        const hasTags = filters.tags.some(tag =>
          retweet.tags.includes(tag) || retweet.auto_tags.includes(tag)
        );
        if (!hasTags) return false;
      }

      if (filters.startDate) {
        const start = new Date(filters.startDate);
        if (new Date(retweet.captured_at) < start) return false;
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        if (new Date(retweet.captured_at) > end) return false;
      }

      if (filters.source && retweet.source !== filters.source) {
        return false;
      }

      if (filters.hasMedia !== undefined) {
        const hasMedia = retweet.media && retweet.media.length > 0;
        if (filters.hasMedia !== hasMedia) return false;
      }

      return true;
    });
  }

  async getStats() {
    const all = await this.getAllRetweets();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCount = all.filter(r => new Date(r.captured_at) >= today).length;

    const bySources = {};
    for (const r of all) {
      bySources[r.source] = (bySources[r.source] || 0) + 1;
    }

    const byTags = {};
    for (const r of all) {
      for (const tag of [...r.tags, ...r.auto_tags]) {
        byTags[tag] = (byTags[tag] || 0) + 1;
      }
    }

    const unsyncedCount = all.filter(r => !r.synced_at).length;

    return {
      total: all.length,
      today: todayCount,
      bySource: bySources,
      byTag: byTags,
      unsynced: unsyncedCount
    };
  }

  async getSetting(key, defaultValue = null) {
    await this.ready();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.SETTINGS], 'readonly');
      const store = transaction.objectStore(STORES.SETTINGS);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result?.value ?? defaultValue);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setSetting(key, value) {
    await this.ready();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.SETTINGS], 'readwrite');
      const store = transaction.objectStore(STORES.SETTINGS);
      const request = store.put({ key, value });

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllSettings() {
    await this.ready();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.SETTINGS], 'readonly');
      const store = transaction.objectStore(STORES.SETTINGS);
      const request = store.getAll();

      request.onsuccess = () => {
        const settings = {};
        for (const item of request.result || []) {
          settings[item.key] = item.value;
        }
        resolve(settings);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getCategories() {
    await this.ready();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.CATEGORIES], 'readonly');
      const store = transaction.objectStore(STORES.CATEGORIES);
      const request = store.getAll();

      request.onsuccess = () => {
        const categories = {};
        const results = request.result || [];

        if (results.length === 0) {
          resolve(DEFAULT_CATEGORIES);
        } else {
          for (const cat of results) {
            categories[cat.name] = cat.keywords;
          }
          resolve(categories);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setCategory(name, keywords) {
    await this.ready();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.CATEGORIES], 'readwrite');
      const store = transaction.objectStore(STORES.CATEGORIES);
      const request = store.put({ name, keywords });

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteCategory(name) {
    await this.ready();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.CATEGORIES], 'readwrite');
      const store = transaction.objectStore(STORES.CATEGORIES);
      const request = store.delete(name);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async initDefaultCategories() {
    for (const [name, keywords] of Object.entries(DEFAULT_CATEGORIES)) {
      await this.setCategory(name, keywords);
    }
  }

  async saveSearch(search) {
    await this.ready();

    const record = {
      id: generateId(),
      name: search.name,
      query: search.query || '',
      filters: search.filters || {},
      created_at: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.SAVED_SEARCHES], 'readwrite');
      const store = transaction.objectStore(STORES.SAVED_SEARCHES);
      const request = store.add(record);

      request.onsuccess = () => resolve(record);
      request.onerror = () => reject(request.error);
    });
  }

  async getSavedSearches() {
    await this.ready();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.SAVED_SEARCHES], 'readonly');
      const store = transaction.objectStore(STORES.SAVED_SEARCHES);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSavedSearch(id) {
    await this.ready();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.SAVED_SEARCHES], 'readwrite');
      const store = transaction.objectStore(STORES.SAVED_SEARCHES);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async exportAll() {
    const retweets = await this.getAllRetweets();
    const settings = await this.getAllSettings();
    const categories = await this.getCategories();
    const savedSearches = await this.getSavedSearches();

    return {
      version: DB_VERSION,
      exported_at: new Date().toISOString(),
      retweets,
      settings,
      categories,
      savedSearches
    };
  }

  async clearAll() {
    await this.ready();

    const stores = [STORES.RETWEETS, STORES.SETTINGS, STORES.SAVED_SEARCHES, STORES.CATEGORIES];

    for (const storeName of stores) {
      await new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      });
    }
  }
}

// ==================== IMPORTER FUNCTIONS ====================

function cleanRetweetText(text) {
  if (!text) return '';
  return text.replace(/^RT @\w+:\s*/, '').trim();
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

async function importArchive(data) {
  try {
    let tweets;

    if (data.startsWith('window.YTD.tweets.part')) {
      const jsonStart = data.indexOf('[');
      const jsonData = data.substring(jsonStart);
      tweets = JSON.parse(jsonData);
    } else if (data.startsWith('[')) {
      tweets = JSON.parse(data);
    } else {
      throw new Error('Unrecognized archive format');
    }

    const categories = await db.getCategories();
    const retweets = [];

    for (const item of tweets) {
      const tweet = item.tweet || item;

      const isRetweet = tweet.full_text?.startsWith('RT @') ||
                        tweet.retweeted_status ||
                        tweet.text?.startsWith('RT @');
      const isQuote = tweet.is_quote_status || tweet.quoted_status;

      if (!isRetweet && !isQuote) continue;

      const text = tweet.full_text || tweet.text || '';

      let userHandle = '';
      let userName = '';

      if (tweet.retweeted_status) {
        userHandle = tweet.retweeted_status.user?.screen_name || '';
        userName = tweet.retweeted_status.user?.name || '';
      } else if (text.startsWith('RT @')) {
        const match = text.match(/^RT @(\w+):/);
        if (match) userHandle = match[1];
      }

      let quotedText = '';
      let quotedAuthor = '';

      if (tweet.quoted_status) {
        quotedText = tweet.quoted_status.full_text || tweet.quoted_status.text || '';
        quotedAuthor = tweet.quoted_status.user?.screen_name || '';
      }

      const media = [];
      const entities = tweet.extended_entities || tweet.entities;

      if (entities?.media) {
        for (const m of entities.media) {
          media.push({
            type: m.type === 'photo' ? 'image' : m.type,
            url: m.media_url_https || m.media_url,
            thumb_url: m.media_url_https || m.media_url
          });
        }
      }

      const textToAnalyze = text + ' ' + quotedText;
      const autoTags = suggestTags(textToAnalyze, categories);

      retweets.push({
        tweet_id: tweet.id_str || tweet.id,
        user_handle: userHandle,
        user_name: userName,
        text: cleanRetweetText(text),
        quoted_text: quotedText,
        quoted_author: quotedAuthor,
        media,
        original_created_at: tweet.created_at ? new Date(tweet.created_at).toISOString() : null,
        source: SOURCES.ARCHIVE,
        source_url: userHandle ? `https://x.com/${userHandle}/status/${tweet.id_str || tweet.id}` : '',
        auto_tags: autoTags,
        raw_payload: tweet
      });
    }

    const result = await db.addRetweets(retweets);

    return {
      added: result.added,
      duplicates: result.duplicates,
      total: retweets.length
    };
  } catch (error) {
    console.error('Archive import error:', error);
    throw new Error(`Failed to parse archive: ${error.message}`);
  }
}

async function importCSV(data) {
  try {
    const lines = data.split('\n');
    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }

    const header = parseCSVLine(lines[0]);
    const requiredColumns = ['tweet_id', 'text'];
    const headerLower = header.map(h => h.toLowerCase().trim());

    for (const col of requiredColumns) {
      if (!headerLower.includes(col)) {
        throw new Error(`Missing required column: ${col}`);
      }
    }

    const indices = {
      tweet_id: headerLower.indexOf('tweet_id'),
      user_handle: headerLower.indexOf('user_handle') !== -1 ? headerLower.indexOf('user_handle') : headerLower.indexOf('author'),
      user_name: headerLower.indexOf('user_name') !== -1 ? headerLower.indexOf('user_name') : headerLower.indexOf('name'),
      text: headerLower.indexOf('text') !== -1 ? headerLower.indexOf('text') : headerLower.indexOf('content'),
      date: headerLower.indexOf('date') !== -1 ? headerLower.indexOf('date') : headerLower.indexOf('created_at'),
      url: headerLower.indexOf('url') !== -1 ? headerLower.indexOf('url') : headerLower.indexOf('source_url'),
      tags: headerLower.indexOf('tags')
    };

    const categories = await db.getCategories();
    const retweets = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = parseCSVLine(line);
      if (values.length < 2) continue;

      const tweetId = values[indices.tweet_id]?.trim();
      const text = values[indices.text]?.trim();

      if (!tweetId || !text) continue;

      const userHandle = indices.user_handle !== -1 ? values[indices.user_handle]?.trim() : '';
      const userName = indices.user_name !== -1 ? values[indices.user_name]?.trim() : '';
      const date = indices.date !== -1 ? values[indices.date]?.trim() : '';
      const url = indices.url !== -1 ? values[indices.url]?.trim() : '';
      const tags = indices.tags !== -1 ? values[indices.tags]?.split(',').map(t => t.trim()).filter(t => t) : [];

      const autoTags = suggestTags(text, categories);

      retweets.push({
        tweet_id: tweetId,
        user_handle: userHandle.replace('@', ''),
        user_name: userName,
        text: text,
        quoted_text: '',
        quoted_author: '',
        media: [],
        original_created_at: date ? new Date(date).toISOString() : null,
        source: SOURCES.CSV,
        source_url: url || (userHandle ? `https://x.com/${userHandle.replace('@', '')}/status/${tweetId}` : ''),
        tags: tags,
        auto_tags: autoTags
      });
    }

    if (retweets.length === 0) {
      throw new Error('No valid retweets found in CSV');
    }

    const result = await db.addRetweets(retweets);

    return {
      added: result.added,
      duplicates: result.duplicates,
      total: retweets.length
    };
  } catch (error) {
    console.error('CSV import error:', error);
    throw new Error(`Failed to parse CSV: ${error.message}`);
  }
}

async function importNitter(url) {
  try {
    if (!url.includes('/rss') && !url.includes('rss.')) {
      throw new Error('Invalid Nitter RSS URL. Expected format: https://nitter.net/username/rss');
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.status}`);
    }

    const xml = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');

    const items = doc.querySelectorAll('item');
    if (items.length === 0) {
      throw new Error('No items found in RSS feed');
    }

    const categories = await db.getCategories();
    const retweets = [];

    for (const item of items) {
      const title = item.querySelector('title')?.textContent || '';
      const link = item.querySelector('link')?.textContent || '';
      const description = item.querySelector('description')?.textContent || '';
      const pubDate = item.querySelector('pubDate')?.textContent;

      if (!title.startsWith('RT by') && !title.includes('RT @')) continue;

      const tweetIdMatch = link.match(/\/status\/(\d+)/);
      if (!tweetIdMatch) continue;

      const tweetId = tweetIdMatch[1];

      const authorMatch = link.match(/\/(\w+)\/status/);
      const userHandle = authorMatch ? authorMatch[1] : '';

      const text = description
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();

      const autoTags = suggestTags(text, categories);

      retweets.push({
        tweet_id: tweetId,
        user_handle: userHandle,
        user_name: '',
        text: text,
        quoted_text: '',
        quoted_author: '',
        media: [],
        original_created_at: pubDate ? new Date(pubDate).toISOString() : null,
        source: SOURCES.NITTER,
        source_url: link.replace(/nitter\.[^/]+/, 'x.com'),
        auto_tags: autoTags
      });
    }

    if (retweets.length === 0) {
      throw new Error('No retweets found in RSS feed');
    }

    const result = await db.addRetweets(retweets);

    return {
      added: result.added,
      duplicates: result.duplicates,
      total: retweets.length
    };
  } catch (error) {
    console.error('Nitter import error:', error);
    throw new Error(`Failed to import from Nitter: ${error.message}`);
  }
}

// ==================== DATABASE INSTANCE ====================

console.log('[Retweet Filter] Service worker starting...');

const db = new RetweetDB();

// Initialize database when extension loads
db.ready().then(() => {
  console.log('[Retweet Filter] Database initialized successfully');
}).catch(error => {
  console.error('[Retweet Filter] Database init error:', error);
});

console.log('[Retweet Filter] Service worker loaded, setting up message listener...');

// ==================== MESSAGE HANDLER ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Retweet Filter] Received message:', message.type);
  handleMessage(message, sender).then(response => {
    console.log('[Retweet Filter] Sending response for:', message.type, response?.success);
    sendResponse(response);
  }).catch(error => {
    console.error('[Retweet Filter] Message handler error:', error);
    sendResponse({ success: false, error: error.message });
  });
  return true;
});

async function handleMessage(message, sender) {
  const { type, data } = message;

  switch (type) {
    case MESSAGES.CAPTURE_RETWEET:
      return captureRetweet(data);

    case MESSAGES.GET_RETWEETS:
      return getRetweetsHandler(data);

    case MESSAGES.SEARCH_RETWEETS:
      return searchRetweetsHandler(data);

    case MESSAGES.UPDATE_TAGS:
      return updateTagsHandler(data);

    case MESSAGES.DELETE_RETWEET:
      return deleteRetweetHandler(data);

    case MESSAGES.IMPORT_DATA:
      return importDataHandler(data);

    case MESSAGES.EXPORT_DATA:
      return exportDataHandler();

    case MESSAGES.GET_STATS:
      return getStatsHandler();

    case MESSAGES.GET_SETTINGS:
      return getSettingsHandler();

    case MESSAGES.UPDATE_SETTINGS:
      return updateSettingsHandler(data);

    case MESSAGES.OPEN_DASHBOARD:
      return openDashboardHandler();

    case 'BULK_UPDATE_TAGS':
      return bulkUpdateTagsHandler(data);

    case 'GET_CATEGORIES':
      return getCategoriesHandler();

    case 'SET_CATEGORY':
      return setCategoryHandler(data);

    case 'DELETE_CATEGORY':
      return deleteCategoryHandler(data);

    case 'FILTER_RETWEETS':
      return filterRetweetsHandler(data);

    case 'GET_SAVED_SEARCHES':
      return getSavedSearchesHandler();

    case 'SAVE_SEARCH':
      return saveSearchHandler(data);

    case 'DELETE_SAVED_SEARCH':
      return deleteSavedSearchHandler(data);

    case 'BULK_DELETE':
      return bulkDeleteHandler(data);

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

// ==================== MESSAGE HANDLERS ====================

async function captureRetweet(data) {
  try {
    console.log('[Retweet Filter] Capturing retweet with data:', {
      tweet_id: data.tweet_id,
      user_handle: data.user_handle,
      has_avatar: !!data.user_avatar,
      avatar_url: data.user_avatar?.substring(0, 50),
      like_count: data.like_count,
      retweet_count: data.retweet_count,
      view_count: data.view_count,
      user_verified: data.user_verified
    });

    const categories = await db.getCategories();
    const autoTags = suggestTags(data.text + ' ' + (data.quoted_text || ''), categories);

    const retweet = await db.addRetweet({
      ...data,
      auto_tags: autoTags
    });

    if (retweet) {
      console.log('[Retweet Filter] Retweet saved successfully:', {
        id: retweet.id,
        has_avatar: !!retweet.user_avatar,
        like_count: retweet.like_count,
        retweet_count: retweet.retweet_count
      });
      updateBadge();
      return { success: true, data: retweet };
    } else {
      return { success: false, error: 'Duplicate retweet' };
    }
  } catch (error) {
    console.error('[Retweet Filter] Capture error:', error);
    return { success: false, error: error.message };
  }
}

async function getRetweetsHandler(options) {
  try {
    const result = await db.getRetweets(options);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function searchRetweetsHandler({ query, filters }) {
  try {
    const allRetweets = await db.getAllRetweets();
    const results = searchRetweets(allRetweets, query, filters);
    return { success: true, data: results };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function updateTagsHandler({ id, tags }) {
  try {
    const updated = await db.updateTags(id, tags);
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function bulkUpdateTagsHandler({ ids, tagsToAdd, tagsToRemove }) {
  try {
    const count = await db.bulkUpdateTags(ids, tagsToAdd, tagsToRemove);
    return { success: true, data: { updated: count } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function deleteRetweetHandler({ id }) {
  try {
    await db.deleteRetweet(id);
    updateBadge();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function bulkDeleteHandler({ ids }) {
  try {
    const count = await db.deleteRetweets(ids);
    updateBadge();
    return { success: true, data: { deleted: count } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function importDataHandler({ type, data }) {
  try {
    let result;
    switch (type) {
      case 'archive':
        result = await importArchive(data);
        break;
      case 'csv':
        result = await importCSV(data);
        break;
      case 'nitter':
        result = await importNitter(data);
        break;
      default:
        throw new Error('Unknown import type');
    }

    updateBadge();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function exportDataHandler() {
  try {
    const data = await db.exportAll();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getStatsHandler() {
  try {
    const stats = await db.getStats();
    return { success: true, data: stats };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getSettingsHandler() {
  try {
    const settings = await db.getAllSettings();
    return { success: true, data: settings };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function updateSettingsHandler(settings) {
  try {
    for (const [key, value] of Object.entries(settings)) {
      await db.setSetting(key, value);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getCategoriesHandler() {
  try {
    const categories = await db.getCategories();
    return { success: true, data: categories };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function setCategoryHandler({ name, keywords }) {
  try {
    await db.setCategory(name, keywords);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function deleteCategoryHandler({ name }) {
  try {
    await db.deleteCategory(name);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function filterRetweetsHandler(filters) {
  try {
    const results = await db.filterRetweets(filters);
    return { success: true, data: results };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getSavedSearchesHandler() {
  try {
    const searches = await db.getSavedSearches();
    return { success: true, data: searches };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function saveSearchHandler(search) {
  try {
    const saved = await db.saveSearch(search);
    return { success: true, data: saved };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function deleteSavedSearchHandler({ id }) {
  try {
    await db.deleteSavedSearch(id);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function openDashboardHandler() {
  try {
    const dashboardUrl = chrome.runtime.getURL('src/dashboard/dashboard.html');
    await chrome.tabs.create({ url: dashboardUrl });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== BADGE UPDATE ====================

async function updateBadge() {
  try {
    const stats = await db.getStats();
    const count = stats.today;

    if (count > 0) {
      await chrome.action.setBadgeText({ text: count.toString() });
      await chrome.action.setBadgeBackgroundColor({ color: '#1d9bf0' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch (error) {
    console.error('[Retweet Filter] Badge update error:', error);
  }
}

// ==================== EXTENSION LIFECYCLE ====================

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Retweet Filter] Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    await db.initDefaultCategories();
    console.log('[Retweet Filter] Default categories initialized');
  }

  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Retweet Filter] Extension started');
  updateBadge();
});

// Periodic badge update
setInterval(updateBadge, 60000);
