/**
 * Unit tests for search module
 */

import { searchRetweets, highlightMatches, getSearchSuggestions } from '../../extension/src/lib/search.js';

// Mock data
const mockRetweets = [
  {
    id: '1',
    tweet_id: '123',
    user_handle: 'openai',
    user_name: 'OpenAI',
    text: 'Introducing GPT-4 with improved capabilities',
    quoted_text: '',
    tags: ['AI'],
    auto_tags: ['Language Models'],
    captured_at: '2024-01-15T10:00:00Z',
    source: 'browser',
    media: []
  },
  {
    id: '2',
    tweet_id: '456',
    user_handle: 'figma',
    user_name: 'Figma',
    text: 'Design systems at scale',
    quoted_text: '',
    tags: ['Design'],
    auto_tags: [],
    captured_at: '2024-01-14T10:00:00Z',
    source: 'browser',
    media: []
  },
  {
    id: '3',
    tweet_id: '789',
    user_handle: 'github',
    user_name: 'GitHub',
    text: 'Copilot uses GPT for code completion',
    quoted_text: 'AI-powered development',
    tags: [],
    auto_tags: ['Programming', 'AI'],
    captured_at: '2024-01-13T10:00:00Z',
    source: 'archive',
    media: [{ type: 'image', url: 'test.jpg' }]
  }
];

describe('searchRetweets', () => {
  test('should return all results when no query', () => {
    const results = searchRetweets(mockRetweets, '');
    expect(results.length).toBe(3);
  });

  test('should find results by text content', () => {
    const results = searchRetweets(mockRetweets, 'GPT');
    expect(results.length).toBe(2);
    expect(results.some(r => r.item.id === '1')).toBe(true);
    expect(results.some(r => r.item.id === '3')).toBe(true);
  });

  test('should find results by user handle', () => {
    const results = searchRetweets(mockRetweets, 'figma');
    expect(results.length).toBe(1);
    expect(results[0].item.user_handle).toBe('figma');
  });

  test('should find results by quoted text', () => {
    const results = searchRetweets(mockRetweets, 'AI-powered');
    expect(results.length).toBe(1);
    expect(results[0].item.id).toBe('3');
  });

  test('should filter by tags', () => {
    const results = searchRetweets(mockRetweets, '', { tags: ['Design'] });
    expect(results.length).toBe(1);
    expect(results[0].item.id).toBe('2');
  });

  test('should filter by source', () => {
    const results = searchRetweets(mockRetweets, '', { source: 'archive' });
    expect(results.length).toBe(1);
    expect(results[0].item.id).toBe('3');
  });

  test('should filter by hasMedia', () => {
    const results = searchRetweets(mockRetweets, '', { hasMedia: true });
    expect(results.length).toBe(1);
    expect(results[0].item.id).toBe('3');
  });

  test('should filter by date range', () => {
    const results = searchRetweets(mockRetweets, '', {
      startDate: '2024-01-14',
      endDate: '2024-01-15'
    });
    expect(results.length).toBe(2);
  });

  test('should combine search and filters', () => {
    const results = searchRetweets(mockRetweets, 'GPT', { tags: ['AI'] });
    expect(results.length).toBe(2);
  });
});

describe('highlightMatches', () => {
  test('should highlight single match', () => {
    const result = highlightMatches('Hello World', [[0, 4]]);
    expect(result).toContain('<mark class="rf-highlight">Hello</mark>');
  });

  test('should highlight multiple matches', () => {
    const result = highlightMatches('GPT-4 and GPT-5', [[0, 2], [10, 12]]);
    expect(result.match(/<mark/g).length).toBe(2);
  });

  test('should return original text if no matches', () => {
    const result = highlightMatches('Hello World', []);
    expect(result).toBe('Hello World');
  });

  test('should escape HTML in text', () => {
    const result = highlightMatches('<script>alert()</script>', []);
    expect(result).not.toContain('<script>');
  });
});

describe('getSearchSuggestions', () => {
  test('should extract authors', () => {
    const suggestions = getSearchSuggestions(mockRetweets);
    expect(suggestions.authors).toContain('openai');
    expect(suggestions.authors).toContain('figma');
    expect(suggestions.authors).toContain('github');
  });

  test('should extract tags', () => {
    const suggestions = getSearchSuggestions(mockRetweets);
    expect(suggestions.tags).toContain('AI');
    expect(suggestions.tags).toContain('Design');
    expect(suggestions.tags).toContain('Programming');
  });
});

// Simple test runner for browser environment
if (typeof window !== 'undefined') {
  const tests = [];
  let currentSuite = '';

  globalThis.describe = (name, fn) => {
    currentSuite = name;
    fn();
  };

  globalThis.test = (name, fn) => {
    tests.push({ suite: currentSuite, name, fn });
  };

  globalThis.expect = (actual) => ({
    toBe: (expected) => {
      if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
    },
    toContain: (expected) => {
      if (!actual.includes(expected)) throw new Error(`Expected to contain ${expected}`);
    },
    not: {
      toContain: (expected) => {
        if (actual.includes(expected)) throw new Error(`Expected not to contain ${expected}`);
      }
    }
  });

  // Run tests
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test.fn();
      console.log(`✓ ${test.suite} > ${test.name}`);
      passed++;
    } catch (error) {
      console.error(`✗ ${test.suite} > ${test.name}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
}
