/**
 * Sync Routes for Retweet Filter API
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { db } = require('../index');

// Apply auth to all routes
router.use(authMiddleware);

/**
 * POST /api/sync - Batch upsert retweets
 */
router.post('/sync', (req, res) => {
  const { retweets } = req.body;
  const userId = req.user.userId;

  if (!retweets || !Array.isArray(retweets)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const stmt = db.prepare(`
    INSERT INTO retweets (
      user_id, tweet_id, user_handle, user_name, text, quoted_text,
      quoted_author, media, captured_at, original_created_at, tags,
      auto_tags, source, source_url, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, tweet_id) DO UPDATE SET
      user_handle = excluded.user_handle,
      user_name = excluded.user_name,
      text = excluded.text,
      quoted_text = excluded.quoted_text,
      quoted_author = excluded.quoted_author,
      media = excluded.media,
      tags = excluded.tags,
      auto_tags = excluded.auto_tags,
      updated_at = CURRENT_TIMESTAMP
  `);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  const transaction = db.transaction(() => {
    for (const r of retweets) {
      try {
        const result = stmt.run(
          userId,
          r.tweet_id,
          r.user_handle || '',
          r.user_name || '',
          r.text || '',
          r.quoted_text || '',
          r.quoted_author || '',
          JSON.stringify(r.media || []),
          r.captured_at,
          r.original_created_at,
          JSON.stringify(r.tags || []),
          JSON.stringify(r.auto_tags || []),
          r.source || 'sync',
          r.source_url || ''
        );

        if (result.changes > 0) {
          inserted++;
        }
      } catch (error) {
        console.error('Sync error for tweet:', r.tweet_id, error);
        errors++;
      }
    }
  });

  try {
    transaction();
    res.json({ success: true, inserted, updated, errors });
  } catch (error) {
    console.error('Transaction error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

/**
 * GET /api/retweets - Get all retweets for user
 */
router.get('/retweets', (req, res) => {
  const userId = req.user.userId;
  const { since, limit = 1000, offset = 0 } = req.query;

  let query = 'SELECT * FROM retweets WHERE user_id = ?';
  const params = [userId];

  if (since) {
    query += ' AND updated_at > ?';
    params.push(since);
  }

  query += ' ORDER BY captured_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  try {
    const rows = db.prepare(query).all(...params);

    const retweets = rows.map(row => ({
      ...row,
      media: JSON.parse(row.media || '[]'),
      tags: JSON.parse(row.tags || '[]'),
      auto_tags: JSON.parse(row.auto_tags || '[]')
    }));

    // Get total count
    const countQuery = since
      ? 'SELECT COUNT(*) as count FROM retweets WHERE user_id = ? AND updated_at > ?'
      : 'SELECT COUNT(*) as count FROM retweets WHERE user_id = ?';
    const countParams = since ? [userId, since] : [userId];
    const { count } = db.prepare(countQuery).get(...countParams);

    res.json({ retweets, total: count });
  } catch (error) {
    console.error('Get retweets error:', error);
    res.status(500).json({ error: 'Failed to fetch retweets' });
  }
});

/**
 * GET /api/retweets/:tweetId - Get single retweet
 */
router.get('/retweets/:tweetId', (req, res) => {
  const userId = req.user.userId;
  const { tweetId } = req.params;

  try {
    const row = db.prepare(
      'SELECT * FROM retweets WHERE user_id = ? AND tweet_id = ?'
    ).get(userId, tweetId);

    if (!row) {
      return res.status(404).json({ error: 'Retweet not found' });
    }

    res.json({
      ...row,
      media: JSON.parse(row.media || '[]'),
      tags: JSON.parse(row.tags || '[]'),
      auto_tags: JSON.parse(row.auto_tags || '[]')
    });
  } catch (error) {
    console.error('Get retweet error:', error);
    res.status(500).json({ error: 'Failed to fetch retweet' });
  }
});

/**
 * DELETE /api/retweets/:tweetId - Delete a retweet
 */
router.delete('/retweets/:tweetId', (req, res) => {
  const userId = req.user.userId;
  const { tweetId } = req.params;

  try {
    const result = db.prepare(
      'DELETE FROM retweets WHERE user_id = ? AND tweet_id = ?'
    ).run(userId, tweetId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Retweet not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete retweet error:', error);
    res.status(500).json({ error: 'Failed to delete retweet' });
  }
});

/**
 * GET /api/stats - Get user statistics
 */
router.get('/stats', (req, res) => {
  const userId = req.user.userId;

  try {
    const total = db.prepare(
      'SELECT COUNT(*) as count FROM retweets WHERE user_id = ?'
    ).get(userId).count;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCount = db.prepare(
      'SELECT COUNT(*) as count FROM retweets WHERE user_id = ? AND captured_at >= ?'
    ).get(userId, today.toISOString()).count;

    const bySource = db.prepare(`
      SELECT source, COUNT(*) as count
      FROM retweets
      WHERE user_id = ?
      GROUP BY source
    `).all(userId);

    res.json({
      total,
      today: todayCount,
      bySource: Object.fromEntries(bySource.map(r => [r.source, r.count]))
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
