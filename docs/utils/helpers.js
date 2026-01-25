/**
 * Generate a UUID v4
 * @returns {string} UUID string
 */
export function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Debounce function execution
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
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

/**
 * Throttle function execution
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Format a date for display
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
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

/**
 * Format a full timestamp
 * @param {Date|string|number} date - Date to format
 * @returns {string} Full timestamp string
 */
export function formatTimestamp(date) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Truncate text to a maximum length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Extract tweet ID from a URL
 * @param {string} url - Tweet URL
 * @returns {string|null} Tweet ID or null
 */
export function extractTweetId(url) {
  if (!url) return null;
  const match = url.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Build a tweet URL from components
 * @param {string} handle - User handle
 * @param {string} tweetId - Tweet ID
 * @returns {string} Tweet URL
 */
export function buildTweetUrl(handle, tweetId) {
  return `https://x.com/${handle}/status/${tweetId}`;
}

/**
 * Clean and normalize text
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
export function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width chars
    .trim();
}

/**
 * Parse hashtags from text
 * @param {string} text - Text to parse
 * @returns {string[]} Array of hashtags (without #)
 */
export function parseHashtags(text) {
  if (!text) return [];
  const matches = text.match(/#[\w]+/g) || [];
  return matches.map(tag => tag.substring(1).toLowerCase());
}

/**
 * Parse mentions from text
 * @param {string} text - Text to parse
 * @returns {string[]} Array of mentions (without @)
 */
export function parseMentions(text) {
  if (!text) return [];
  const matches = text.match(/@[\w]+/g) || [];
  return matches.map(mention => mention.substring(1).toLowerCase());
}

/**
 * Check if a string contains any of the keywords (case-insensitive)
 * @param {string} text - Text to search in
 * @param {string[]} keywords - Keywords to search for
 * @returns {boolean} True if any keyword found
 */
export function containsKeywords(text, keywords) {
  if (!text || !keywords || keywords.length === 0) return false;
  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
}

/**
 * Simple encryption for local storage (not cryptographically secure)
 * @param {string} text - Text to encode
 * @returns {string} Encoded text
 */
export function simpleEncode(text) {
  if (!text) return '';
  return btoa(encodeURIComponent(text));
}

/**
 * Simple decryption for local storage
 * @param {string} encoded - Encoded text
 * @returns {string} Decoded text
 */
export function simpleDecode(encoded) {
  if (!encoded) return '';
  try {
    return decodeURIComponent(atob(encoded));
  } catch {
    return '';
  }
}

/**
 * Create a queue for batch processing
 * @param {Function} processor - Function to process batches
 * @param {number} batchSize - Size of each batch
 * @param {number} delay - Delay between batches in ms
 * @returns {Object} Queue object with add and flush methods
 */
export function createBatchQueue(processor, batchSize = 10, delay = 1000) {
  let queue = [];
  let timeoutId = null;

  const flush = async () => {
    if (queue.length === 0) return;

    const batch = queue.splice(0, batchSize);
    try {
      await processor(batch);
    } catch (error) {
      console.error('Batch processing error:', error);
    }

    if (queue.length > 0) {
      timeoutId = setTimeout(flush, delay);
    }
  };

  return {
    add(item) {
      queue.push(item);
      if (!timeoutId) {
        timeoutId = setTimeout(flush, delay);
      }
    },
    flush() {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      return flush();
    },
    get length() {
      return queue.length;
    }
  };
}

/**
 * Deep clone an object
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map(item => deepClone(item));

  const cloned = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Check if running in extension context
 * @returns {boolean} True if in extension
 */
export function isExtensionContext() {
  return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
}

/**
 * Safe JSON parse
 * @param {string} str - JSON string
 * @param {*} fallback - Fallback value if parse fails
 * @returns {*} Parsed object or fallback
 */
export function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
