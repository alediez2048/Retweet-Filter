/**
 * Auto-tagging module
 * Suggests tags based on content matching against category keywords
 */

import { DEFAULT_CATEGORIES } from '../utils/constants.js';

/**
 * Suggest tags for content based on keyword matching
 * @param {string} text - Text content to analyze
 * @param {Object} categories - Categories with keywords
 * @returns {string[]} Suggested tags
 */
export function suggestTags(text, categories = DEFAULT_CATEGORIES) {
  if (!text) return [];

  const textLower = text.toLowerCase();
  const suggestions = [];

  for (const [category, keywords] of Object.entries(categories)) {
    for (const keyword of keywords) {
      // Check for word boundary match to avoid false positives
      const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
      if (regex.test(textLower)) {
        if (!suggestions.includes(category)) {
          suggestions.push(category);
        }
        break; // One match is enough for this category
      }
    }
  }

  return suggestions;
}

/**
 * Escape regex special characters
 * @param {string} string - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get matching keywords for a category in text
 * @param {string} text - Text to analyze
 * @param {string} category - Category name
 * @param {Object} categories - Categories with keywords
 * @returns {string[]} Matching keywords
 */
export function getMatchingKeywords(text, category, categories = DEFAULT_CATEGORIES) {
  if (!text || !categories[category]) return [];

  const textLower = text.toLowerCase();
  const matches = [];

  for (const keyword of categories[category]) {
    const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
    if (regex.test(textLower)) {
      matches.push(keyword);
    }
  }

  return matches;
}

/**
 * Analyze text and return detailed tag suggestions
 * @param {string} text - Text to analyze
 * @param {Object} categories - Categories with keywords
 * @returns {Object[]} Detailed suggestions with confidence
 */
export function analyzeContent(text, categories = DEFAULT_CATEGORIES) {
  if (!text) return [];

  const textLower = text.toLowerCase();
  const results = [];

  for (const [category, keywords] of Object.entries(categories)) {
    let matchCount = 0;
    const matchedKeywords = [];

    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi');
      const matches = textLower.match(regex);
      if (matches) {
        matchCount += matches.length;
        if (!matchedKeywords.includes(keyword.toLowerCase())) {
          matchedKeywords.push(keyword.toLowerCase());
        }
      }
    }

    if (matchCount > 0) {
      // Calculate confidence based on match count and keyword diversity
      const confidence = Math.min(1, (matchCount * 0.2) + (matchedKeywords.length * 0.3));

      results.push({
        category,
        matchCount,
        matchedKeywords,
        confidence
      });
    }
  }

  // Sort by confidence
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}

/**
 * Batch tag multiple retweets
 * @param {Object[]} retweets - Retweets to tag
 * @param {Object} categories - Categories with keywords
 * @returns {Object[]} Retweets with auto_tags populated
 */
export function batchSuggestTags(retweets, categories = DEFAULT_CATEGORIES) {
  return retweets.map(retweet => {
    const textToAnalyze = [
      retweet.text,
      retweet.quoted_text,
      retweet.user_name
    ].filter(Boolean).join(' ');

    const autoTags = suggestTags(textToAnalyze, categories);

    return {
      ...retweet,
      auto_tags: autoTags
    };
  });
}

/**
 * Merge manual and auto tags, removing duplicates
 * @param {string[]} manualTags - User-assigned tags
 * @param {string[]} autoTags - System-suggested tags
 * @returns {string[]} Merged unique tags
 */
export function mergeTags(manualTags = [], autoTags = []) {
  const tagSet = new Set([
    ...manualTags.map(t => t.toLowerCase()),
    ...autoTags.map(t => t.toLowerCase())
  ]);

  // Return with original casing from manual tags where possible
  const result = [];
  const added = new Set();

  for (const tag of manualTags) {
    const lower = tag.toLowerCase();
    if (!added.has(lower)) {
      result.push(tag);
      added.add(lower);
    }
  }

  for (const tag of autoTags) {
    const lower = tag.toLowerCase();
    if (!added.has(lower)) {
      result.push(tag);
      added.add(lower);
    }
  }

  return result;
}

/**
 * Validate category keywords
 * @param {string[]} keywords - Keywords to validate
 * @returns {Object} Validation result
 */
export function validateKeywords(keywords) {
  const errors = [];
  const warnings = [];
  const validKeywords = [];

  for (const keyword of keywords) {
    const trimmed = keyword.trim();

    if (trimmed.length === 0) {
      continue; // Skip empty
    }

    if (trimmed.length < 2) {
      warnings.push(`Keyword "${trimmed}" is very short and may cause false matches`);
    }

    if (trimmed.length > 50) {
      errors.push(`Keyword "${trimmed}" is too long (max 50 characters)`);
      continue;
    }

    // Check for special characters that might break regex
    if (/[{}()[\]|\\^$]/.test(trimmed)) {
      warnings.push(`Keyword "${trimmed}" contains special characters`);
    }

    validKeywords.push(trimmed);
  }

  return {
    valid: errors.length === 0,
    keywords: validKeywords,
    errors,
    warnings
  };
}

/**
 * Generate keyword suggestions from text
 * @param {string} text - Text to analyze
 * @returns {string[]} Suggested keywords
 */
export function extractKeywordSuggestions(text) {
  if (!text) return [];

  // Extract potential keywords (capitalized words, hashtags, technical terms)
  const words = text.split(/\s+/);
  const suggestions = new Set();

  for (const word of words) {
    // Clean the word
    const cleaned = word.replace(/[^a-zA-Z0-9-]/g, '');

    if (cleaned.length < 3) continue;

    // Capitalized words (potential proper nouns/technologies)
    if (/^[A-Z][a-z]+/.test(cleaned)) {
      suggestions.add(cleaned);
    }

    // All caps (acronyms)
    if (/^[A-Z]{2,}$/.test(cleaned)) {
      suggestions.add(cleaned);
    }

    // Technical terms (camelCase, snake_case)
    if (/[a-z][A-Z]/.test(cleaned) || cleaned.includes('_')) {
      suggestions.add(cleaned);
    }
  }

  // Extract hashtags
  const hashtags = text.match(/#[\w]+/g) || [];
  for (const tag of hashtags) {
    suggestions.add(tag.substring(1));
  }

  return Array.from(suggestions).slice(0, 20);
}

export default {
  suggestTags,
  getMatchingKeywords,
  analyzeContent,
  batchSuggestTags,
  mergeTags,
  validateKeywords,
  extractKeywordSuggestions
};
