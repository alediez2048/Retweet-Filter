-- Everything in one file for simplicity

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Simple platform type
CREATE TYPE platform_type AS ENUM ('twitter', 'instagram', 'tiktok', 'youtube');

-- Main posts table - simplified
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Identity
  post_id TEXT NOT NULL,
  platform platform_type NOT NULL DEFAULT 'twitter',
  
  -- Content
  user_handle TEXT,
  user_name TEXT,
  user_avatar TEXT,
  text TEXT,
  
  -- Media
  media JSONB DEFAULT '[]'::jsonb,
  
  -- Engagement
  like_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  
  -- Tags
  tags TEXT[] DEFAULT '{}',
  auto_tags TEXT[] DEFAULT '{}',
  
  -- Meta
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT DEFAULT 'browser',
  source_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, post_id, platform)
);

-- Indexes
CREATE INDEX idx_posts_user_platform ON posts(user_id, platform);
CREATE INDEX idx_posts_captured_at ON posts(captured_at DESC);
CREATE INDEX idx_posts_tags ON posts USING GIN(tags);
CREATE INDEX idx_posts_text_search ON posts USING GIN(to_tsvector('english', COALESCE(text, '')));

-- RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own posts" ON posts
  FOR ALL USING (auth.uid() = user_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_updated_at 
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Simple search function
CREATE OR REPLACE FUNCTION search_posts(
  search_user_id UUID,
  search_query TEXT DEFAULT NULL,
  search_platforms TEXT[] DEFAULT NULL,
  search_tags TEXT[] DEFAULT NULL,
  limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  post_id TEXT,
  platform platform_type,
  user_handle TEXT,
  text TEXT,
  captured_at TIMESTAMPTZ,
  tags TEXT[],
  relevance REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.post_id,
    p.platform,
    p.user_handle,
    p.text,
    p.captured_at,
    p.tags,
    CASE 
      WHEN search_query IS NOT NULL 
      THEN ts_rank(to_tsvector('english', COALESCE(p.text, '')), plainto_tsquery('english', search_query))
      ELSE 0 
    END AS relevance
  FROM posts p
  WHERE p.user_id = search_user_id
    AND (search_platforms IS NULL OR p.platform::TEXT = ANY(search_platforms))
    AND (search_tags IS NULL OR p.tags && search_tags)
    AND (
      search_query IS NULL 
      OR to_tsvector('english', COALESCE(p.text, '')) @@ plainto_tsquery('english', search_query)
      OR p.user_handle ILIKE '%' || search_query || '%'
    )
  ORDER BY relevance DESC, p.captured_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Stats function
CREATE OR REPLACE FUNCTION get_user_stats(stats_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total', COUNT(*),
    'today', COUNT(*) FILTER (WHERE captured_at >= CURRENT_DATE),
    'by_platform', json_object_agg(
      platform::TEXT,
      COUNT(*)
    )
  )
  INTO result
  FROM posts
  WHERE user_id = stats_user_id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
