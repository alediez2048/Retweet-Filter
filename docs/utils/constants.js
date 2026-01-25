// Database constants
export const DB_NAME = 'RetweetFilterDB';
export const DB_VERSION = 1;

// Store names
export const STORES = {
  RETWEETS: 'retweets',
  SETTINGS: 'settings',
  SAVED_SEARCHES: 'savedSearches',
  CATEGORIES: 'categories'
};

// Source types
export const SOURCES = {
  BROWSER: 'browser',
  ARCHIVE: 'archive',
  NITTER: 'nitter',
  CSV: 'csv',
  MANUAL: 'manual'
};

// Default categories with keywords for auto-tagging (18 categories)
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
};

// Theme colors (X Dark Theme)
export const THEME = {
  background: '#000000',
  backgroundSecondary: '#16181c',
  backgroundHover: '#1d1f23',
  border: '#2f3336',
  textPrimary: '#e7e9ea',
  textSecondary: '#71767b',
  accent: '#1d9bf0',
  accentHover: '#1a8cd8',
  success: '#00ba7c',
  error: '#f4212e',
  warning: '#ffad1f'
};

// Pagination
export const PAGE_SIZE = 50;

// Search settings
export const SEARCH_OPTIONS = {
  keys: ['text', 'quoted_text', 'user_handle', 'user_name', 'quoted_author'],
  threshold: 0.3,
  ignoreLocation: true,
  includeScore: true,
  includeMatches: true
};

// Capture settings
export const CAPTURE_DEBOUNCE_MS = 300;
export const CAPTURE_BATCH_SIZE = 10;
export const CAPTURE_BATCH_DELAY_MS = 1000;

// Sync settings
export const SYNC_BATCH_SIZE = 100;
export const SYNC_RETRY_ATTEMPTS = 3;
export const SYNC_RETRY_DELAY_MS = 5000;

// Messages between content script and service worker
export const MESSAGES = {
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

// Local storage keys
export const STORAGE_KEYS = {
  LAST_SYNC: 'lastSync',
  SYNC_TOKEN: 'syncToken',
  SYNC_ENDPOINT: 'syncEndpoint'
};
