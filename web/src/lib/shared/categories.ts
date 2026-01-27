// Copy DEFAULT_CATEGORIES from extension/src/background/service-worker.js
export const DEFAULT_CATEGORIES = {
  // Technology
  'AI': [
    'artificial intelligence', 'machine learning', 'neural', 'GPT', 'LLM',
    'deep learning', 'AI', 'openai', 'anthropic', 'model', 'training',
    'inference', 'embeddings', 'vector', 'RAG'
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
  'Design': [
    'design', 'UI', 'UX', 'figma', 'typography', 'visual', 'aesthetic',
    'interface', 'prototype', 'wireframe', 'mockup', 'layout', 'color',
    'brand', 'logo', 'graphic'
  ],

  // Business & Finance
  'Finance': [
    'finance', 'investing', 'stocks', 'bonds', 'portfolio', 'dividend',
    'earnings', 'market', 'bull', 'bear', 'trading', 'hedge fund', 'ETF',
    'index fund', 'compound', 'interest rate', 'fed', 'inflation', 'recession'
  ],
  'Crypto': [
    'crypto', 'bitcoin', 'ethereum', 'blockchain', 'defi', 'NFT', 'web3',
    'wallet', 'token', 'mining', 'staking', 'dao', 'smart contract', 'solana',
    'altcoin', 'exchange', 'hodl', 'bull run', 'bear market'
  ],
  'Business': [
    'business', 'strategy', 'management', 'leadership', 'CEO', 'executive',
    'revenue', 'profit', 'margins', 'operations', 'consulting', 'enterprise',
    'B2B', 'B2C', 'supply chain', 'logistics', 'quarterly', 'market share'
  ],
  'Startups': [
    'startup', 'founder', 'YC', 'venture', 'fundraise', 'seed', 'series',
    'investor', 'pitch', 'MVP', 'product-market fit', 'growth', 'scale',
    'acquisition', 'IPO', 'valuation'
  ],
  'Marketing': [
    'marketing', 'SEO', 'content', 'viral', 'engagement', 'conversion',
    'funnel', 'ads', 'campaign', 'audience', 'brand awareness', 'influencer',
    'social media', 'analytics', 'growth hacking', 'copywriting', 'CTR'
  ],

  // Knowledge & Learning
  'Science': [
    'research', 'paper', 'study', 'scientists', 'discovery', 'experiment',
    'hypothesis', 'data', 'analysis', 'peer-review', 'journal', 'citation',
    'breakthrough', 'innovation'
  ],
  'Philosophy': [
    'philosophy', 'stoic', 'ethics', 'moral', 'existential', 'metaphysics',
    'epistemology', 'consciousness', 'free will', 'determinism', 'nihilism',
    'rationalism', 'empiricism', 'virtue', 'wisdom', 'meaning', 'truth'
  ],
  'Books': [
    'book', 'reading', 'author', 'novel', 'non-fiction', 'biography',
    'memoir', 'bestseller', 'kindle', 'audiobook', 'library', 'literature',
    'chapter', 'must-read', 'book club', 'recommendation'
  ],
  'Education': [
    'education', 'learning', 'course', 'tutorial', 'teaching', 'student',
    'university', 'degree', 'online course', 'certification', 'bootcamp',
    'curriculum', 'lecture', 'professor', 'academic', 'scholarship'
  ],

  // Lifestyle & Culture
  'Health': [
    'health', 'fitness', 'workout', 'exercise', 'nutrition', 'diet', 'sleep',
    'mental health', 'meditation', 'wellness', 'gym', 'running', 'yoga',
    'weight loss', 'muscle', 'cardio', 'longevity', 'biohacking'
  ],
  'Productivity': [
    'productivity', 'habits', 'routine', 'focus', 'time management', 'goals',
    'discipline', 'motivation', 'efficiency', 'workflow', 'automation',
    'calendar', 'todo', 'deep work', 'pomodoro', 'morning routine'
  ],
  'Entertainment': [
    'movie', 'film', 'tv show', 'series', 'netflix', 'streaming', 'music',
    'album', 'concert', 'gaming', 'video game', 'anime', 'comedy', 'drama',
    'documentary', 'podcast', 'youtube', 'viral video'
  ],
  'Sports': [
    'sports', 'football', 'basketball', 'soccer', 'baseball', 'tennis',
    'golf', 'nfl', 'nba', 'mlb', 'championship', 'playoffs', 'athlete',
    'coach', 'team', 'score', 'winning', 'draft', 'trade'
  ],

  // News & Current Events
  'Politics': [
    'politics', 'election', 'vote', 'democrat', 'republican', 'congress',
    'senate', 'policy', 'legislation', 'government', 'president', 'campaign',
    'political', 'reform', 'bipartisan', 'poll', 'debate'
  ],
  'News': [
    'breaking', 'news', 'headline', 'report', 'update', 'developing',
    'exclusive', 'investigation', 'sources say', 'according to', 'announced',
    'confirmed', 'latest', 'just in', 'coverage'
  ]
}

export const PLATFORM_CONFIG = {
  twitter: { icon: '𝕏', color: 'bg-gray-900', label: 'X/Twitter' },
  instagram: { icon: '📷', color: 'bg-pink-500', label: 'Instagram' },
  tiktok: { icon: '🎵', color: 'bg-black', label: 'TikTok' },
  youtube: { icon: '▶️', color: 'bg-red-600', label: 'YouTube' }
} as const
