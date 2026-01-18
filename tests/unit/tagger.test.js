/**
 * Unit tests for tagger module
 */

import { suggestTags, getMatchingKeywords, analyzeContent, validateKeywords } from '../../extension/src/lib/tagger.js';

const testCategories = {
  'AI': ['artificial intelligence', 'machine learning', 'GPT', 'neural network'],
  'Design': ['design', 'UI', 'UX', 'figma'],
  'Programming': ['javascript', 'python', 'code', 'developer']
};

describe('suggestTags', () => {
  test('should suggest AI tag for AI content', () => {
    const tags = suggestTags('GPT-4 is a breakthrough in artificial intelligence', testCategories);
    expect(tags).toContain('AI');
  });

  test('should suggest multiple tags', () => {
    const tags = suggestTags('Using GPT for code generation in javascript', testCategories);
    expect(tags).toContain('AI');
    expect(tags).toContain('Programming');
  });

  test('should not duplicate tags', () => {
    const tags = suggestTags('GPT GPT GPT machine learning', testCategories);
    const aiCount = tags.filter(t => t === 'AI').length;
    expect(aiCount).toBe(1);
  });

  test('should return empty for no matches', () => {
    const tags = suggestTags('This is a random tweet about cats', testCategories);
    expect(tags.length).toBe(0);
  });

  test('should handle empty text', () => {
    const tags = suggestTags('', testCategories);
    expect(tags.length).toBe(0);
  });

  test('should handle null text', () => {
    const tags = suggestTags(null, testCategories);
    expect(tags.length).toBe(0);
  });

  test('should be case insensitive', () => {
    const tags = suggestTags('MACHINE LEARNING is amazing', testCategories);
    expect(tags).toContain('AI');
  });
});

describe('getMatchingKeywords', () => {
  test('should return matching keywords', () => {
    const keywords = getMatchingKeywords('Using GPT and neural networks', 'AI', testCategories);
    expect(keywords).toContain('GPT');
    expect(keywords).toContain('neural network');
  });

  test('should return empty for no matches', () => {
    const keywords = getMatchingKeywords('Design is cool', 'AI', testCategories);
    expect(keywords.length).toBe(0);
  });
});

describe('analyzeContent', () => {
  test('should return confidence scores', () => {
    const results = analyzeContent('GPT and machine learning for AI', testCategories);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].category).toBe('AI');
    expect(results[0].confidence).toBeGreaterThan(0);
  });

  test('should sort by confidence', () => {
    const results = analyzeContent('GPT machine learning neural network', testCategories);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].confidence).toBeLessThanOrEqual(results[i - 1].confidence);
    }
  });
});

describe('validateKeywords', () => {
  test('should validate valid keywords', () => {
    const result = validateKeywords(['GPT', 'machine learning', 'AI']);
    expect(result.valid).toBe(true);
    expect(result.keywords.length).toBe(3);
  });

  test('should warn about short keywords', () => {
    const result = validateKeywords(['AI', 'a', 'GPT']);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('should reject too long keywords', () => {
    const longKeyword = 'a'.repeat(100);
    const result = validateKeywords([longKeyword]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('should filter empty keywords', () => {
    const result = validateKeywords(['GPT', '', '  ', 'AI']);
    expect(result.keywords.length).toBe(2);
  });
});

// Simple test runner
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
    toBeGreaterThan: (expected) => {
      if (actual <= expected) throw new Error(`Expected ${actual} > ${expected}`);
    },
    toBeLessThanOrEqual: (expected) => {
      if (actual > expected) throw new Error(`Expected ${actual} <= ${expected}`);
    }
  });

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
