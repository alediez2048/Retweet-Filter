/**
 * Sync module for optional server synchronization
 * Provides secure, user-controlled data sync capabilities
 */

import { db } from './db.js';
import { SYNC_BATCH_SIZE, SYNC_RETRY_ATTEMPTS, SYNC_RETRY_DELAY_MS } from '../utils/constants.js';
import { simpleEncode, simpleDecode } from '../utils/helpers.js';

/**
 * Sync manager class
 */
class SyncManager {
  constructor() {
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.endpoint = null;
    this.token = null;
  }

  /**
   * Initialize sync with endpoint and token
   * @param {string} endpoint - Sync API endpoint
   * @param {string} token - JWT token
   */
  async init(endpoint, token) {
    this.endpoint = endpoint;
    this.token = token;

    // Store encrypted token
    await db.setSetting('syncEndpoint', endpoint);
    await db.setSetting('syncToken', simpleEncode(token));
    await db.setSetting('syncEnabled', true);
  }

  /**
   * Load saved configuration
   */
  async loadConfig() {
    const endpoint = await db.getSetting('syncEndpoint');
    const encodedToken = await db.getSetting('syncToken');
    const enabled = await db.getSetting('syncEnabled', false);

    if (enabled && endpoint && encodedToken) {
      this.endpoint = endpoint;
      this.token = simpleDecode(encodedToken);
      return true;
    }

    return false;
  }

  /**
   * Disconnect and clear sync configuration
   */
  async disconnect() {
    this.endpoint = null;
    this.token = null;
    this.isSyncing = false;

    await db.setSetting('syncEndpoint', '');
    await db.setSetting('syncToken', '');
    await db.setSetting('syncEnabled', false);
    await db.setSetting('lastSyncTime', null);
  }

  /**
   * Test connection to sync endpoint
   * @returns {Object} Test result
   */
  async testConnection() {
    if (!this.endpoint || !this.token) {
      return { success: false, error: 'Sync not configured' };
    }

    try {
      const response = await fetch(`${this.endpoint}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        return { success: true };
      } else if (response.status === 401) {
        return { success: false, error: 'Invalid token' };
      } else {
        return { success: false, error: `Server error: ${response.status}` };
      }
    } catch (error) {
      return { success: false, error: `Connection failed: ${error.message}` };
    }
  }

  /**
   * Sync all unsynced retweets to server
   * @returns {Object} Sync result
   */
  async syncToServer() {
    if (this.isSyncing) {
      return { success: false, error: 'Sync already in progress' };
    }

    if (!this.endpoint || !this.token) {
      const loaded = await this.loadConfig();
      if (!loaded) {
        return { success: false, error: 'Sync not configured' };
      }
    }

    this.isSyncing = true;
    let syncedCount = 0;
    let errorCount = 0;

    try {
      // Get all unsynced retweets
      const allRetweets = await db.getAllRetweets();
      const unsynced = allRetweets.filter(r => !r.synced_at);

      // Process in batches
      for (let i = 0; i < unsynced.length; i += SYNC_BATCH_SIZE) {
        const batch = unsynced.slice(i, i + SYNC_BATCH_SIZE);

        const result = await this.syncBatch(batch);

        if (result.success) {
          // Mark as synced
          for (const item of batch) {
            await db.updateRetweet(item.id, { synced_at: new Date().toISOString() });
          }
          syncedCount += batch.length;
        } else {
          errorCount += batch.length;
        }
      }

      // Update last sync time
      this.lastSyncTime = new Date().toISOString();
      await db.setSetting('lastSyncTime', this.lastSyncTime);

      return {
        success: true,
        synced: syncedCount,
        errors: errorCount,
        total: unsynced.length
      };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync a batch of retweets
   * @param {Object[]} batch - Batch of retweets
   * @returns {Object} Batch sync result
   */
  async syncBatch(batch, attempt = 1) {
    try {
      const response = await fetch(`${this.endpoint}/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          retweets: batch.map(r => ({
            tweet_id: r.tweet_id,
            user_handle: r.user_handle,
            user_name: r.user_name,
            text: r.text,
            quoted_text: r.quoted_text,
            quoted_author: r.quoted_author,
            media: r.media,
            captured_at: r.captured_at,
            original_created_at: r.original_created_at,
            tags: r.tags,
            auto_tags: r.auto_tags,
            source: r.source,
            source_url: r.source_url
          }))
        })
      });

      if (response.ok) {
        return { success: true };
      } else if (response.status === 401) {
        return { success: false, error: 'Authentication failed' };
      } else {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (error) {
      // Retry logic
      if (attempt < SYNC_RETRY_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, SYNC_RETRY_DELAY_MS));
        return this.syncBatch(batch, attempt + 1);
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Pull retweets from server (for cross-device sync)
   * @returns {Object} Pull result
   */
  async pullFromServer() {
    if (!this.endpoint || !this.token) {
      const loaded = await this.loadConfig();
      if (!loaded) {
        return { success: false, error: 'Sync not configured' };
      }
    }

    try {
      const lastSync = await db.getSetting('lastSyncTime');
      const url = lastSync
        ? `${this.endpoint}/retweets?since=${encodeURIComponent(lastSync)}`
        : `${this.endpoint}/retweets`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const retweets = data.retweets || [];

      // Add to local database
      let added = 0;
      let duplicates = 0;

      for (const r of retweets) {
        const result = await db.addRetweet({
          ...r,
          source: 'sync',
          synced_at: new Date().toISOString()
        });

        if (result) {
          added++;
        } else {
          duplicates++;
        }
      }

      return {
        success: true,
        added,
        duplicates,
        total: retweets.length
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a retweet from server
   * @param {string} tweetId - Tweet ID to delete
   * @returns {Object} Delete result
   */
  async deleteFromServer(tweetId) {
    if (!this.endpoint || !this.token) {
      return { success: false, error: 'Sync not configured' };
    }

    try {
      const response = await fetch(`${this.endpoint}/retweets/${tweetId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      return { success: response.ok };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get sync status
   * @returns {Object} Status info
   */
  async getStatus() {
    const enabled = await db.getSetting('syncEnabled', false);
    const lastSync = await db.getSetting('lastSyncTime');
    const stats = await db.getStats();

    return {
      enabled,
      endpoint: this.endpoint,
      lastSync,
      unsynced: stats.unsynced,
      isSyncing: this.isSyncing
    };
  }
}

// Export singleton instance
export const syncManager = new SyncManager();
export default syncManager;
