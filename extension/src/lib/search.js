/**
 * Search module using Fuse.js-like fuzzy search
 * Provides full-text search across retweets with filtering
 */

import { SEARCH_OPTIONS } from '../utils/constants.js';

/**
 * Simple fuzzy search implementation
 * @param {string} text - Text to search in
 * @param {string} pattern - Pattern to search for
 * @returns {Object|null} Match info or null
 */
function fuzzyMatch(text, pattern) {
  if (!text || !pattern) return null;

  const textLower = text.toLowerCase();
  const patternLower = pattern.toLowerCase();

  // Exact match
  const exactIndex = textLower.indexOf(patternLower);
  if (exactIndex !== -1) {
    return {
      score: 0,
      indices: [[exactIndex, exactIndex + pattern.length - 1]]
    };
  }

  // Fuzzy match
  let patternIdx = 0;
  let textIdx = 0;
  const indices = [];
  let score = 0;

  while (textIdx < text.length && patternIdx < pattern.length) {
    if (textLower[textIdx] === patternLower[patternIdx]) {
      indices.push([textIdx, textIdx]);
      patternIdx++;
    } else {
      score += 0.1; // Penalty for gaps
    }
    textIdx++;
  }

  if (patternIdx === pattern.length) {
    return { score, indices };
  }

  return null;
}

/**
 * Search retweets with query and filters
 * @param {Object[]} retweets - Array of retweets
 * @param {string} query - Search query
 * @param {Object} filters - Filter criteria
 * @returns {Object[]} Search results with scores
 */
export function searchRetweets(retweets, query, filters = {}) {
  let results = [...retweets];

  // Apply filters first
  results = applyFilters(results, filters);

  // If no query, return filtered results
  if (!query || query.trim() === '') {
    return results.map(item => ({
      item,
      score: 0,
      matches: []
    })).sort((a, b) => new Date(b.item.captured_at) - new Date(a.item.captured_at));
  }

  const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

  // Search each retweet
  const searchResults = [];

  for (const retweet of results) {
    let totalScore = 0;
    let matchCount = 0;
    const matches = [];

    for (const term of searchTerms) {
      // Search in each searchable field
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

    // Only include if we matched at least one term
    if (matchCount > 0) {
      searchResults.push({
        item: retweet,
        score: totalScore / matchCount,
        matches
      });
    }
  }

  // Sort by score (lower is better), then by date
  searchResults.sort((a, b) => {
    if (Math.abs(a.score - b.score) < 0.1) {
      return new Date(b.item.captured_at) - new Date(a.item.captured_at);
    }
    return a.score - b.score;
  });

  return searchResults;
}

/**
 * Apply filters to retweets
 * @param {Object[]} retweets - Array of retweets
 * @param {Object} filters - Filter criteria
 * @returns {Object[]} Filtered retweets
 */
function applyFilters(retweets, filters) {
  return retweets.filter(retweet => {
    // Filter by tags (any match)
    if (filters.tags && filters.tags.length > 0) {
      const allTags = [...(retweet.tags || []), ...(retweet.auto_tags || [])];
      const hasMatchingTag = filters.tags.some(tag =>
        allTags.some(t => t.toLowerCase() === tag.toLowerCase())
      );
      if (!hasMatchingTag) return false;
    }

    // Filter by date range
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

    // Filter by source
    if (filters.source && retweet.source !== filters.source) {
      return false;
    }

    // Filter by has media
    if (filters.hasMedia !== undefined) {
      const hasMedia = retweet.media && retweet.media.length > 0;
      if (filters.hasMedia !== hasMedia) return false;
    }

    // Filter by author
    if (filters.author) {
      const authorLower = filters.author.toLowerCase();
      if (!retweet.user_handle.toLowerCase().includes(authorLower) &&
          !retweet.user_name.toLowerCase().includes(authorLower)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Highlight search matches in text
 * @param {string} text - Original text
 * @param {Array} indices - Array of [start, end] index pairs
 * @returns {string} HTML with highlighted matches
 */
export function highlightMatches(text, indices) {
  if (!text || !indices || indices.length === 0) return text;

  // Sort indices by start position
  const sortedIndices = [...indices].sort((a, b) => a[0] - b[0]);

  let result = '';
  let lastEnd = 0;

  for (const [start, end] of sortedIndices) {
    // Add text before match
    result += escapeHtml(text.substring(lastEnd, start));
    // Add highlighted match
    result += `<mark class="rf-highlight">${escapeHtml(text.substring(start, end + 1))}</mark>`;
    lastEnd = end + 1;
  }

  // Add remaining text
  result += escapeHtml(text.substring(lastEnd));

  return result;
}

/**
 * Escape HTML entities
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Get search suggestions based on existing data
 * @param {Object[]} retweets - Array of retweets
 * @returns {Object} Suggestions object
 */
export function getSearchSuggestions(retweets) {
  const authors = new Set();
  const tags = new Set();
  const hashtags = new Set();

  for (const retweet of retweets) {
    if (retweet.user_handle) authors.add(retweet.user_handle);

    for (const tag of [...(retweet.tags || []), ...(retweet.auto_tags || [])]) {
      tags.add(tag);
    }

    // Extract hashtags from text
    const hashtagMatches = (retweet.text || '').match(/#[\w]+/g) || [];
    for (const ht of hashtagMatches) {
      hashtags.add(ht.substring(1));
    }
  }

  return {
    authors: Array.from(authors).slice(0, 50),
    tags: Array.from(tags),
    hashtags: Array.from(hashtags).slice(0, 50)
  };
}

/**
 * Build search index for faster lookups
 * @param {Object[]} retweets - Array of retweets
 * @returns {Object} Search index
 */
export function buildSearchIndex(retweets) {
  const index = {
    byTweetId: new Map(),
    byAuthor: new Map(),
    byTag: new Map(),
    byDate: new Map()
  };

  for (const retweet of retweets) {
    // Index by tweet ID
    index.byTweetId.set(retweet.tweet_id, retweet);

    // Index by author
    const handle = retweet.user_handle.toLowerCase();
    if (!index.byAuthor.has(handle)) {
      index.byAuthor.set(handle, []);
    }
    index.byAuthor.get(handle).push(retweet);

    // Index by tags
    const allTags = [...(retweet.tags || []), ...(retweet.auto_tags || [])];
    for (const tag of allTags) {
      const tagLower = tag.toLowerCase();
      if (!index.byTag.has(tagLower)) {
        index.byTag.set(tagLower, []);
      }
      index.byTag.get(tagLower).push(retweet);
    }

    // Index by date (YYYY-MM-DD)
    const dateKey = new Date(retweet.captured_at).toISOString().split('T')[0];
    if (!index.byDate.has(dateKey)) {
      index.byDate.set(dateKey, []);
    }
    index.byDate.get(dateKey).push(retweet);
  }

  return index;
}

export default {
  searchRetweets,
  highlightMatches,
  getSearchSuggestions,
  buildSearchIndex
};
