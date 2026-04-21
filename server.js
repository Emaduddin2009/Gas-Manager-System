// ============================================================
//  GAS MANAGER PRO — Backend Server
//  Node.js + Express + SQLite (better-sqlite3)
//
//  Start:  node server.js
//  Dev:    nodemon server.js
// ============================================================
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

// ── Middleware ───────────────────────────────────────────────
app.use(cors({
  origin: '*',  // In production, replace with your frontend domain
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));   // 10mb allows base64 images
app.use(express.urlencoded({ extended: true }));

// ── Serve Frontend (index.html) ──────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ───────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/owner',     require('./routes/owner'));

// ── Health Check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Gas Manager Pro API is running 🔥', version: '1.0.0' });
});

// ── Catch-all: serve frontend for any unknown route ──────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global Error Handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ ok: false, error: 'Internal server error.' });
});

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('  ⛽  Gas Manager Pro — Backend');
  console.log(`  🚀  Server running at http://localhost:${PORT}`);
  console.log(`  📁  Database: ${process.env.DATABASE_PATH || './gas_manager.db'}`);
  console.log(`  🔑  Owner code: ${process.env.OWNER_CODE || 'Gas9775'}`);
  console.log('');
});

module.exports = app;
