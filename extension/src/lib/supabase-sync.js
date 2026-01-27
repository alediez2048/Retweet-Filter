/**
 * Simple Supabase sync module for extension
 * Standalone - no dependencies on other extension code
 */

// Configuration
const SUPABASE_URL = 'http://localhost:54321' // Change in production
const SUPABASE_ANON_KEY = 'your-anon-key'

class SupabaseSync {
  constructor() {
    this.client = null
    this.user = null
    this.init()
  }

  async init() {
    try {
      // Check for existing session
      const { supabase_session } = await chrome.storage.local.get('supabase_session')
      
      if (supabase_session) {
        // Create client with saved session
        this.client = this.createClient()
        // Verify session is still valid
        const { data, error } = await this.client.auth.getUser()
        if (!error && data.user) {
          this.user = data.user
          console.log('[Sync] Authenticated:', this.user.email)
        }
      }
    } catch (error) {
      console.error('[Sync] Init error:', error)
    }
  }

  createClient() {
    // Minimal Supabase client - just fetch API calls
    return {
      auth: {
        getUser: async () => {
          const { supabase_session } = await chrome.storage.local.get('supabase_session')
          if (!supabase_session) return { data: { user: null }, error: null }
          
          const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
              'Authorization': `Bearer ${supabase_session.access_token}`,
              'apikey': SUPABASE_ANON_KEY
            }
          })
          const user = await response.json()
          return { data: { user }, error: null }
        }
      }
    }
  }

  async syncPost(post) {
    if (!this.user) {
      console.log('[Sync] Not authenticated, skipping')
      return false
    }

    try {
      const { supabase_session } = await chrome.storage.local.get('supabase_session')
      
      const response = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabase_session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          user_id: this.user.id,
          post_id: post.tweet_id || post.post_id,
          platform: post.platform || 'twitter',
          user_handle: post.user_handle,
          user_name: post.user_name,
          user_avatar: post.user_avatar,
          text: post.text,
          media: post.media || [],
          like_count: post.like_count || 0,
          view_count: post.view_count || 0,
          tags: post.tags || [],
          auto_tags: post.auto_tags || [],
          captured_at: post.captured_at,
          source: post.source || 'browser',
          source_url: post.source_url
        })
      })

      if (response.ok) {
        console.log('[Sync] Post synced:', post.post_id || post.tweet_id)
        return true
      }
      
      return false
    } catch (error) {
      console.error('[Sync] Sync error:', error)
      return false
    }
  }

  async batchSync(posts) {
    const results = { success: 0, failed: 0 }
    
    for (const post of posts) {
      const synced = await this.syncPost(post)
      if (synced) results.success++
      else results.failed++
    }
    
    return results
  }

  isAuthenticated() {
    return !!this.user
  }
}

// Export singleton
const supabaseSync = new SupabaseSync()
