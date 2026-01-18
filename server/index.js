/**
 * Reference Backend API for Retweet Filter
 * A simple Express server for optional sync functionality
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Initialize SQLite database
const db = new Database(path.join(__dirname, 'retweets.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS retweets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    tweet_id TEXT NOT NULL,
    user_handle TEXT,
    user_name TEXT,
    text TEXT,
    quoted_text TEXT,
    quoted_author TEXT,
    media TEXT,
    captured_at TEXT,
    original_created_at TEXT,
    tags TEXT,
    auto_tags TEXT,
    source TEXT,
    source_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tweet_id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_retweets_user ON retweets(user_id);
  CREATE INDEX IF NOT EXISTS idx_retweets_captured ON retweets(captured_at);
`);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auth middleware
const authMiddleware = require('./middleware/auth');

// Routes
app.use('/api', require('./routes/sync'));

// Health check
app.get('/api/health', authMiddleware, (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Generate token (for testing/setup)
app.post('/api/auth/token', (req, res) => {
  const { username, secret } = req.body;

  // In production, validate credentials properly
  if (secret !== process.env.ADMIN_SECRET && secret !== 'demo-secret') {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Create or get user
  const userId = `user_${Date.now()}`;

  try {
    db.prepare('INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)').run(userId, username || 'default');
  } catch (e) {
    // User exists, find them
  }

  const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '365d' });

  res.json({ token, userId });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Retweet Filter API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

module.exports = { app, db };
