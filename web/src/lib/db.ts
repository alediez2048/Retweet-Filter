import { createClient } from '@/lib/supabase/server'

export async function getUserStats() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data } = await supabase.rpc('get_user_stats', {
    stats_user_id: user.id
  })

  return data
}

export async function getPosts(filters?: {
  platforms?: string[]
  tags?: string[]
  limit?: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  
  let query = supabase
    .from('posts')
    .select('*')
    .eq('user_id', user.id)
    .order('captured_at', { ascending: false })

  if (filters?.platforms) {
    query = query.in('platform', filters.platforms)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  return query
}

export async function searchPosts(
  query: string,
  filters?: {
    platforms?: string[]
    tags?: string[]
  }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data } = await supabase.rpc('search_posts', {
    search_user_id: user.id,
    search_query: query || null,
    search_platforms: filters?.platforms || null,
    search_tags: filters?.tags || null
  })

  return data
}
