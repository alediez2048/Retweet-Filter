/**
 * Import module for historical data
 * Supports X archive, CSV, and Nitter RSS
 */

import { db } from './db.js';
import { suggestTags } from './tagger.js';
import { SOURCES } from '../utils/constants.js';

/**
 * Import from X/Twitter data archive (tweets.js)
 * @param {string} data - Contents of tweets.js file
 * @returns {Object} Import results
 */
export async function importArchive(data) {
  try {
    // Parse the tweets.js file
    // Format: window.YTD.tweets.part0 = [...]
    let tweets;

    // Try different archive formats
    if (data.startsWith('window.YTD.tweets.part')) {
      // Extract JSON from the assignment
      const jsonStart = data.indexOf('[');
      const jsonData = data.substring(jsonStart);
      tweets = JSON.parse(jsonData);
    } else if (data.startsWith('[')) {
      // Direct JSON array
      tweets = JSON.parse(data);
    } else {
      throw new Error('Unrecognized archive format');
    }

    // Get categories for auto-tagging
    const categories = await db.getCategories();

    // Convert to our format
    const retweets = [];

    for (const item of tweets) {
      const tweet = item.tweet || item;

      // Check if this is a retweet
      const isRetweet = tweet.full_text?.startsWith('RT @') ||
                        tweet.retweeted_status ||
                        tweet.text?.startsWith('RT @');

      // Also include quote tweets
      const isQuote = tweet.is_quote_status || tweet.quoted_status;

      if (!isRetweet && !isQuote) continue;

      const text = tweet.full_text || tweet.text || '';

      // Extract original author for retweets
      let userHandle = '';
      let userName = '';

      if (tweet.retweeted_status) {
        userHandle = tweet.retweeted_status.user?.screen_name || '';
        userName = tweet.retweeted_status.user?.name || '';
      } else if (text.startsWith('RT @')) {
        const match = text.match(/^RT @(\w+):/);
        if (match) userHandle = match[1];
      }

      // Extract quoted tweet info
      let quotedText = '';
      let quotedAuthor = '';

      if (tweet.quoted_status) {
        quotedText = tweet.quoted_status.full_text || tweet.quoted_status.text || '';
        quotedAuthor = tweet.quoted_status.user?.screen_name || '';
      }

      // Extract media
      const media = [];
      const entities = tweet.extended_entities || tweet.entities;

      if (entities?.media) {
        for (const m of entities.media) {
          media.push({
            type: m.type === 'photo' ? 'image' : m.type,
            url: m.media_url_https || m.media_url,
            thumb_url: m.media_url_https || m.media_url
          });
        }
      }

      // Auto-tag
      const textToAnalyze = text + ' ' + quotedText;
      const autoTags = suggestTags(textToAnalyze, categories);

      retweets.push({
        tweet_id: tweet.id_str || tweet.id,
        user_handle: userHandle,
        user_name: userName,
        text: cleanRetweetText(text),
        quoted_text: quotedText,
        quoted_author: quotedAuthor,
        media,
        original_created_at: tweet.created_at ? new Date(tweet.created_at).toISOString() : null,
        source: SOURCES.ARCHIVE,
        source_url: userHandle ? `https://x.com/${userHandle}/status/${tweet.id_str || tweet.id}` : '',
        auto_tags: autoTags,
        raw_payload: tweet
      });
    }

    // Batch add to database
    const result = await db.addRetweets(retweets);

    return {
      added: result.added,
      duplicates: result.duplicates,
      total: retweets.length
    };
  } catch (error) {
    console.error('Archive import error:', error);
    throw new Error(`Failed to parse archive: ${error.message}`);
  }
}

/**
 * Import from CSV file
 * Expected columns: tweet_id, user_handle, text, date, url
 * @param {string} data - CSV content
 * @returns {Object} Import results
 */
export async function importCSV(data) {
  try {
    const lines = data.split('\n');
    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }

    // Parse header
    const header = parseCSVLine(lines[0]);
    const requiredColumns = ['tweet_id', 'text'];
    const headerLower = header.map(h => h.toLowerCase().trim());

    for (const col of requiredColumns) {
      if (!headerLower.includes(col)) {
        throw new Error(`Missing required column: ${col}`);
      }
    }

    // Find column indices
    const indices = {
      tweet_id: headerLower.indexOf('tweet_id'),
      user_handle: headerLower.indexOf('user_handle') !== -1 ? headerLower.indexOf('user_handle') : headerLower.indexOf('author'),
      user_name: headerLower.indexOf('user_name') !== -1 ? headerLower.indexOf('user_name') : headerLower.indexOf('name'),
      text: headerLower.indexOf('text') !== -1 ? headerLower.indexOf('text') : headerLower.indexOf('content'),
      date: headerLower.indexOf('date') !== -1 ? headerLower.indexOf('date') : headerLower.indexOf('created_at'),
      url: headerLower.indexOf('url') !== -1 ? headerLower.indexOf('url') : headerLower.indexOf('source_url'),
      tags: headerLower.indexOf('tags')
    };

    // Get categories for auto-tagging
    const categories = await db.getCategories();

    // Parse data rows
    const retweets = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = parseCSVLine(line);
      if (values.length < 2) continue;

      const tweetId = values[indices.tweet_id]?.trim();
      const text = values[indices.text]?.trim();

      if (!tweetId || !text) continue;

      const userHandle = indices.user_handle !== -1 ? values[indices.user_handle]?.trim() : '';
      const userName = indices.user_name !== -1 ? values[indices.user_name]?.trim() : '';
      const date = indices.date !== -1 ? values[indices.date]?.trim() : '';
      const url = indices.url !== -1 ? values[indices.url]?.trim() : '';
      const tags = indices.tags !== -1 ? values[indices.tags]?.split(',').map(t => t.trim()).filter(t => t) : [];

      // Auto-tag
      const autoTags = suggestTags(text, categories);

      retweets.push({
        tweet_id: tweetId,
        user_handle: userHandle.replace('@', ''),
        user_name: userName,
        text: text,
        quoted_text: '',
        quoted_author: '',
        media: [],
        original_created_at: date ? new Date(date).toISOString() : null,
        source: SOURCES.CSV,
        source_url: url || (userHandle ? `https://x.com/${userHandle.replace('@', '')}/status/${tweetId}` : ''),
        tags: tags,
        auto_tags: autoTags
      });
    }

    if (retweets.length === 0) {
      throw new Error('No valid retweets found in CSV');
    }

    // Batch add to database
    const result = await db.addRetweets(retweets);

    return {
      added: result.added,
      duplicates: result.duplicates,
      total: retweets.length
    };
  } catch (error) {
    console.error('CSV import error:', error);
    throw new Error(`Failed to parse CSV: ${error.message}`);
  }
}

/**
 * Import from Nitter RSS feed
 * @param {string} url - Nitter RSS URL
 * @returns {Object} Import results
 */
export async function importNitter(url) {
  try {
    // Validate URL
    if (!url.includes('/rss') && !url.includes('rss.')) {
      throw new Error('Invalid Nitter RSS URL. Expected format: https://nitter.net/username/rss');
    }

    // Fetch RSS feed
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.status}`);
    }

    const xml = await response.text();

    // Parse XML
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');

    const items = doc.querySelectorAll('item');
    if (items.length === 0) {
      throw new Error('No items found in RSS feed');
    }

    // Get categories for auto-tagging
    const categories = await db.getCategories();

    // Parse items
    const retweets = [];

    for (const item of items) {
      const title = item.querySelector('title')?.textContent || '';
      const link = item.querySelector('link')?.textContent || '';
      const description = item.querySelector('description')?.textContent || '';
      const pubDate = item.querySelector('pubDate')?.textContent;

      // Check if it's a retweet
      if (!title.startsWith('RT by') && !title.includes('RT @')) continue;

      // Extract tweet ID from link
      const tweetIdMatch = link.match(/\/status\/(\d+)/);
      if (!tweetIdMatch) continue;

      const tweetId = tweetIdMatch[1];

      // Extract author from link
      const authorMatch = link.match(/\/(\w+)\/status/);
      const userHandle = authorMatch ? authorMatch[1] : '';

      // Clean description (remove HTML)
      const text = description
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();

      // Auto-tag
      const autoTags = suggestTags(text, categories);

      retweets.push({
        tweet_id: tweetId,
        user_handle: userHandle,
        user_name: '',
        text: text,
        quoted_text: '',
        quoted_author: '',
        media: [],
        original_created_at: pubDate ? new Date(pubDate).toISOString() : null,
        source: SOURCES.NITTER,
        source_url: link.replace(/nitter\.[^/]+/, 'x.com'),
        auto_tags: autoTags
      });
    }

    if (retweets.length === 0) {
      throw new Error('No retweets found in RSS feed');
    }

    // Batch add to database
    const result = await db.addRetweets(retweets);

    return {
      added: result.added,
      duplicates: result.duplicates,
      total: retweets.length
    };
  } catch (error) {
    console.error('Nitter import error:', error);
    throw new Error(`Failed to import from Nitter: ${error.message}`);
  }
}

/**
 * Parse a CSV line handling quoted values
 * @param {string} line - CSV line
 * @returns {string[]} Parsed values
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

/**
 * Clean retweet text (remove RT prefix)
 * @param {string} text - Raw tweet text
 * @returns {string} Cleaned text
 */
function cleanRetweetText(text) {
  if (!text) return '';

  // Remove RT @user: prefix
  return text.replace(/^RT @\w+:\s*/, '').trim();
}

/**
 * Generate sample CSV template
 * @returns {string} CSV template
 */
export function generateCSVTemplate() {
  return `tweet_id,user_handle,user_name,text,date,url,tags
1234567890,elonmusk,Elon Musk,"This is a sample tweet text",2024-01-15,https://x.com/elonmusk/status/1234567890,"AI,Tech"
0987654321,sama,Sam Altman,"Another sample tweet about GPT",2024-01-16,https://x.com/sama/status/0987654321,"AI,Language Models"`;
}

/**
 * Validate import data before processing
 * @param {string} data - Data to validate
 * @param {string} type - Import type
 * @returns {Object} Validation result
 */
export function validateImportData(data, type) {
  const errors = [];
  const warnings = [];

  if (!data || data.trim().length === 0) {
    errors.push('Data is empty');
    return { valid: false, errors, warnings };
  }

  switch (type) {
    case 'archive':
      if (!data.includes('YTD.tweets') && !data.startsWith('[')) {
        errors.push('Data does not appear to be a valid X archive file');
      }
      break;

    case 'csv':
      const lines = data.split('\n');
      if (lines.length < 2) {
        errors.push('CSV must have at least a header and one data row');
      }
      const header = lines[0].toLowerCase();
      if (!header.includes('tweet_id')) {
        errors.push('CSV must have a tweet_id column');
      }
      if (!header.includes('text') && !header.includes('content')) {
        errors.push('CSV must have a text or content column');
      }
      break;

    case 'nitter':
      if (!data.includes('nitter') && !data.includes('/rss')) {
        warnings.push('URL does not appear to be a Nitter RSS feed');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export default {
  importArchive,
  importCSV,
  importNitter,
  generateCSVTemplate,
  validateImportData
};
