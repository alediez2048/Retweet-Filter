/**
 * IndexedDB wrapper using Dexie.js patterns but vanilla JS for smaller bundle
 * Provides async CRUD operations for retweets, settings, and saved searches
 */

import { DB_NAME, DB_VERSION, STORES, DEFAULT_CATEGORIES } from '../utils/constants.js';
import { generateId } from '../utils/helpers.js';

class RetweetDB {
  constructor() {
    this.db = null;
    this.dbReady = this.init();
  }

  /**
   * Initialize the database
   */
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

        // Retweets store
        if (!db.objectStoreNames.contains(STORES.RETWEETS)) {
          const retweetsStore = db.createObjectStore(STORES.RETWEETS, { keyPath: 'id' });
          retweetsStore.createIndex('tweet_id', 'tweet_id', { unique: false });
          retweetsStore.createIndex('user_handle', 'user_handle', { unique: false });
          retweetsStore.createIndex('captured_at', 'captured_at', { unique: false });
          retweetsStore.createIndex('source', 'source', { unique: false });
          retweetsStore.createIndex('tweet_id_source', ['tweet_id', 'source'], { unique: true });
        }

        // Settings store
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
        }

        // Saved searches store
        if (!db.objectStoreNames.contains(STORES.SAVED_SEARCHES)) {
          const searchesStore = db.createObjectStore(STORES.SAVED_SEARCHES, { keyPath: 'id' });
          searchesStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Categories store
        if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
          db.createObjectStore(STORES.CATEGORIES, { keyPath: 'name' });
        }
      };
    });
  }

  /**
   * Ensure database is ready before operations
   */
  async ready() {
    await this.dbReady;
    return this.db;
  }

  // ==================== RETWEETS ====================

  /**
   * Add a new retweet
   * @param {Object} retweet - Retweet data
   * @returns {Object} Added retweet with ID
   */
  async addRetweet(retweet) {
    await this.ready();

    const record = {
      id: generateId(),
      tweet_id: retweet.tweet_id,

      // Author information
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
        // Check if duplicate
        if (request.error?.name === 'ConstraintError') {
          resolve(null); // Duplicate, return null
        } else {
          reject(request.error);
        }
      };
    });
  }

  /**
   * Add multiple retweets (for imports)
   * @param {Object[]} retweets - Array of retweet data
   * @returns {Object} Results with added and duplicates counts
   */
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

  /**
   * Get a retweet by ID
   * @param {string} id - Retweet ID
   * @returns {Object|null} Retweet or null
   */
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

  /**
   * Get retweet by tweet_id and source
   * @param {string} tweetId - Tweet ID
   * @param {string} source - Source type
   * @returns {Object|null} Retweet or null
   */
  async getRetweetByTweetId(tweetId, source = 'browser') {
    await this.ready();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.RETWEETS], 'readonly');
      const store = transaction.objectStore(STORES.RETWEETS);
      const index = store.index('tweet_id_source');
      const request = index.get([tweetId, source]);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all retweets with optional pagination
   * @param {Object} options - Query options
   * @returns {Object} Results with items and total count
   */
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
          // Sort items
          items.sort((a, b) => {
            const aVal = a[sortBy];
            const bVal = b[sortBy];
            const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return sortOrder === 'desc' ? -comparison : comparison;
          });

          // Paginate
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

  /**
   * Get all retweets (for search indexing)
   * @returns {Object[]} All retweets
   */
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

  /**
   * Update a retweet
   * @param {string} id - Retweet ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated retweet
   */
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

  /**
   * Update tags for a retweet
   * @param {string} id - Retweet ID
   * @param {string[]} tags - New tags array
   * @returns {Object} Updated retweet
   */
  async updateTags(id, tags) {
    return this.updateRetweet(id, { tags });
  }

  /**
   * Bulk update tags for multiple retweets
   * @param {string[]} ids - Retweet IDs
   * @param {string[]} tagsToAdd - Tags to add
   * @param {string[]} tagsToRemove - Tags to remove
   * @returns {number} Count of updated items
   */
  async bulkUpdateTags(ids, tagsToAdd = [], tagsToRemove = []) {
    await this.ready();
    let updated = 0;

    for (const id of ids) {
      const retweet = await this.getRetweet(id);
      if (retweet) {
        let newTags = [...retweet.tags];

        // Remove tags
        newTags = newTags.filter(tag => !tagsToRemove.includes(tag));

        // Add tags (avoid duplicates)
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

  /**
   * Delete a retweet
   * @param {string} id - Retweet ID
   * @returns {boolean} Success
   */
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

  /**
   * Delete multiple retweets
   * @param {string[]} ids - Retweet IDs
   * @returns {number} Count of deleted items
   */
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

  /**
   * Get retweets by filter criteria
   * @param {Object} filters - Filter criteria
   * @returns {Object[]} Matching retweets
   */
  async filterRetweets(filters = {}) {
    const all = await this.getAllRetweets();

    return all.filter(retweet => {
      // Filter by tags
      if (filters.tags && filters.tags.length > 0) {
        const hasTags = filters.tags.some(tag =>
          retweet.tags.includes(tag) || retweet.auto_tags.includes(tag)
        );
        if (!hasTags) return false;
      }

      // Filter by date range
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        if (new Date(retweet.captured_at) < start) return false;
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        if (new Date(retweet.captured_at) > end) return false;
      }

      // Filter by source
      if (filters.source && retweet.source !== filters.source) {
        return false;
      }

      // Filter by has media
      if (filters.hasMedia !== undefined) {
        const hasMedia = retweet.media && retweet.media.length > 0;
        if (filters.hasMedia !== hasMedia) return false;
      }

      return true;
    });
  }

  /**
   * Get statistics
   * @returns {Object} Stats object
   */
  async getStats() {
    const all = await this.getAllRetweets();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCount = all.filter(r => new Date(r.captured_at) >= today).length;

    // Count by source
    const bySources = {};
    for (const r of all) {
      bySources[r.source] = (bySources[r.source] || 0) + 1;
    }

    // Count by tags
    const byTags = {};
    for (const r of all) {
      for (const tag of [...r.tags, ...r.auto_tags]) {
        byTags[tag] = (byTags[tag] || 0) + 1;
      }
    }

    // Get unsynced count
    const unsyncedCount = all.filter(r => !r.synced_at).length;

    return {
      total: all.length,
      today: todayCount,
      bySource: bySources,
      byTag: byTags,
      unsynced: unsyncedCount
    };
  }

  // ==================== SETTINGS ====================

  /**
   * Get a setting value
   * @param {string} key - Setting key
   * @param {*} defaultValue - Default if not found
   * @returns {*} Setting value
   */
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

  /**
   * Set a setting value
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   */
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

  /**
   * Get all settings
   * @returns {Object} Settings object
   */
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

  // ==================== CATEGORIES ====================

  /**
   * Get all categories
   * @returns {Object} Categories with keywords
   */
  async getCategories() {
    await this.ready();

    return new Promise(async (resolve, reject) => {
      const transaction = this.db.transaction([STORES.CATEGORIES], 'readonly');
      const store = transaction.objectStore(STORES.CATEGORIES);
      const request = store.getAll();

      request.onsuccess = () => {
        const categories = {};
        const results = request.result || [];

        if (results.length === 0) {
          // Return defaults if no custom categories
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

  /**
   * Set a category with keywords
   * @param {string} name - Category name
   * @param {string[]} keywords - Keywords array
   */
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

  /**
   * Delete a category
   * @param {string} name - Category name
   */
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

  /**
   * Initialize default categories
   */
  async initDefaultCategories() {
    for (const [name, keywords] of Object.entries(DEFAULT_CATEGORIES)) {
      await this.setCategory(name, keywords);
    }
  }

  // ==================== SAVED SEARCHES ====================

  /**
   * Save a search
   * @param {Object} search - Search object with name, query, filters
   * @returns {Object} Saved search with ID
   */
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

  /**
   * Get all saved searches
   * @returns {Object[]} Saved searches
   */
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

  /**
   * Delete a saved search
   * @param {string} id - Search ID
   */
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

  // ==================== EXPORT/IMPORT ====================

  /**
   * Export all data
   * @returns {Object} Export data
   */
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

  /**
   * Clear all data
   */
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

// Export singleton instance
export const db = new RetweetDB();
export default db;
