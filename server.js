// ============================================================
//  Gas Manager Pro — Single File Server
//  Everything combined: auth, customers, refills, owner
// ============================================================
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const path     = require('path');
const fs       = require('fs');

// ── Database setup (SQLite) ───────────────────────────────────
const Database = require('better-sqlite3');
const DB_PATH  = process.env.DATABASE_PATH || './gas_manager.db';
const db       = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Create tables if they don't exist ────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          VARCHAR(100)  NOT NULL,
    username      VARCHAR(50)   NOT NULL UNIQUE COLLATE NOCASE,
    password_hash VARCHAR(255)  NOT NULL,
    role          VARCHAR(20)   NOT NULL DEFAULT 'user',
    status        VARCHAR(20)   NOT NULL DEFAULT 'pending',
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER      NOT NULL,
    name             VARCHAR(150) NOT NULL,
    cid              VARCHAR(100),
    phone            VARCHAR(30),
    address          TEXT,
    addon            TEXT,
    buy_date         DATE,
    pipe_expiry      DATE,
    paper_loc        VARCHAR(50),
    photo_data       TEXT,
    paper_photo_data TEXT,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS refill_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER  NOT NULL,
    user_id     INTEGER  NOT NULL,
    refilled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note        TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)     REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_customers_user_id   ON customers(user_id);
  CREATE INDEX IF NOT EXISTS idx_refill_logs_cust_id ON refill_logs(customer_id);
  CREATE INDEX IF NOT EXISTS idx_refill_logs_date    ON refill_logs(refilled_at);
`);

console.log('✅ Database ready at: ' + DB_PATH);

// ── Express setup ─────────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth middleware ───────────────────────────────────────────
function requireAuth(req, res, next) {
  const h = req.headers['authorization'];
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'No token provided.' });
  try {
    req.user = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ ok: false, error: 'Token invalid or expired.' }); }
}

function requireApproved(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role === 'owner') return next();
    if (req.user.status !== 'approved') return res.status(403).json({ ok: false, error: req.user.status === 'pending' ? 'Account pending approval.' : 'Account blocked.' });
    next();
  });
}

function requireOwner(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'owner') return res.status(403).json({ ok: false, error: 'Owner only.' });
    next();
  });
}

function signToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role, status: user.status, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ============================================================
//  AUTH ROUTES
// ============================================================
app.post('/api/auth/signup', (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || !password) return res.status(400).json({ ok: false, error: 'All fields required.' });
  if (username.length < 3) return res.status(400).json({ ok: false, error: 'Username min 3 characters.' });
  if (password.length < 4) return res.status(400).json({ ok: false, error: 'Password min 4 characters.' });
  if (username.toUpperCase() === (process.env.OWNER_CODE || '').toUpperCase()) return res.status(400).json({ ok: false, error: 'Reserved username.' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) return res.status(409).json({ ok: false, error: 'Username already taken.' });
  const password_hash = bcrypt.hashSync(password, 12);
  const result = db.prepare('INSERT INTO users (name, username, password_hash, role, status) VALUES (?, ?, ?, ?, ?)').run(name, username, password_hash, 'user', 'pending');
  res.status(201).json({ ok: true, message: 'Account created! Waiting for owner approval.', userId: result.lastInsertRowid });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username) return res.status(400).json({ ok: false, error: 'Username required.' });
  if (username === process.env.OWNER_CODE) {
    const token = jwt.sign({ userId: 0, username: 'owner', role: 'owner', status: 'approved', name: 'Owner' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.json({ ok: true, token, role: 'owner', name: 'Owner' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ ok: false, error: 'Wrong username or password.' });
  if (user.status === 'pending') return res.status(403).json({ ok: false, error: 'Account pending approval.' });
  if (user.status === 'blocked') return res.status(403).json({ ok: false, error: 'Account blocked. Contact owner.' });
  res.json({ ok: true, token: signToken(user), role: user.role, name: user.name, username: user.username });
});

app.get('/api/auth/me', (req, res) => {
  const h = req.headers['authorization'];
  if (!h) return res.status(401).json({ ok: false });
  try {
    const decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'owner') {
      const user = db.prepare('SELECT status, name FROM users WHERE id = ?').get(decoded.userId);
      if (!user || user.status !== 'approved') return res.status(403).json({ ok: false, error: 'Not approved.' });
    }
    res.json({ ok: true, ...decoded });
  } catch { res.status(401).json({ ok: false, error: 'Invalid token.' }); }
});

// ============================================================
//  CUSTOMER ROUTES
// ============================================================
app.get('/api/customers', requireApproved, (req, res) => {
  try {
    const customers = db.prepare(`
      SELECT c.*, COUNT(r.id) AS refill_count, MAX(r.refilled_at) AS last_refill
      FROM customers c LEFT JOIN refill_logs r ON r.customer_id = c.id
      WHERE c.user_id = ? GROUP BY c.id ORDER BY c.name ASC
    `).all(req.user.userId);
    res.json({ ok: true, data: customers });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/customers/:id', requireApproved, (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
    if (!customer) return res.status(404).json({ ok: false, error: 'Customer not found.' });
    const history = db.prepare('SELECT * FROM refill_logs WHERE customer_id = ? ORDER BY refilled_at DESC').all(customer.id);
    res.json({ ok: true, data: { ...customer, history } });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/customers', requireApproved, (req, res) => {
  try {
    const { name, cid, phone, address, addon, buy_date, pipe_expiry, paper_loc, photo_data, paper_photo_data } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ ok: false, error: 'Name required.' });
    const result = db.prepare(`
      INSERT INTO customers (user_id, name, cid, phone, address, addon, buy_date, pipe_expiry, paper_loc, photo_data, paper_photo_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.userId, name.trim(), cid||null, phone||null, address||null, addon||null, buy_date||null, pipe_expiry||null, paper_loc||'My Home', photo_data||null, paper_photo_data||null);
    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.put('/api/customers/:id', requireApproved, (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM customers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found.' });
    const { name, cid, phone, address, addon, buy_date, pipe_expiry, paper_loc, photo_data, paper_photo_data } = req.body;
    db.prepare(`
      UPDATE customers SET name=?, cid=?, phone=?, address=?, addon=?, buy_date=?, pipe_expiry=?, paper_loc=?, photo_data=?, paper_photo_data=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND user_id=?
    `).run(name, cid||null, phone||null, address||null, addon||null, buy_date||null, pipe_expiry||null, paper_loc||'My Home', photo_data||null, paper_photo_data||null, req.params.id, req.user.userId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.delete('/api/customers/:id', requireApproved, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM customers WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId);
    if (result.changes === 0) return res.status(404).json({ ok: false, error: 'Not found.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ============================================================
//  REFILL ROUTES
// ============================================================
app.get('/api/customers/:id/refills/range', requireApproved, (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ ok: false, error: 'from and to required.' });
    const results = db.prepare(`
      SELECT c.id AS customer_id, c.name, c.cid, c.phone, c.photo_data,
        COUNT(r.id) AS refill_count, GROUP_CONCAT(r.refilled_at, '||') AS refill_dates
      FROM customers c JOIN refill_logs r ON r.customer_id = c.id
      WHERE c.user_id = ? AND r.refilled_at BETWEEN ? AND ?
      GROUP BY c.id ORDER BY refill_count DESC
    `).all(req.user.userId, from + 'T00:00:00', to + 'T23:59:59');
    const totalRefills = results.reduce((s, r) => s + r.refill_count, 0);
    res.json({ ok: true, data: results, totalRefills, customerCount: results.length });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/customers/:id/refills', requireApproved, (req, res) => {
  try {
    const customer = db.prepare('SELECT id FROM customers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
    if (!customer) return res.status(404).json({ ok: false, error: 'Not found.' });
    const logs = db.prepare('SELECT * FROM refill_logs WHERE customer_id = ? ORDER BY refilled_at DESC').all(req.params.id);
    res.json({ ok: true, data: logs });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/customers/:id/refills', requireApproved, (req, res) => {
  try {
    const customer = db.prepare('SELECT id FROM customers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
    if (!customer) return res.status(404).json({ ok: false, error: 'Not found.' });
    const { refilled_at, note } = req.body;
    const result = db.prepare('INSERT INTO refill_logs (customer_id, user_id, refilled_at, note) VALUES (?, ?, ?, ?)').run(req.params.id, req.user.userId, refilled_at || new Date().toISOString(), note || null);
    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.delete('/api/customers/:id/refills/:logId', requireApproved, (req, res) => {
  try {
    const log = db.prepare(`SELECT r.id FROM refill_logs r JOIN customers c ON c.id = r.customer_id WHERE r.id = ? AND c.user_id = ?`).get(req.params.logId, req.user.userId);
    if (!log) return res.status(404).json({ ok: false, error: 'Not found.' });
    db.prepare('DELETE FROM refill_logs WHERE id = ?').run(req.params.logId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ============================================================
//  OWNER ROUTES
// ============================================================
app.get('/api/owner/users', requireOwner, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, name, username, role, status, created_at,
        (SELECT COUNT(*) FROM customers WHERE user_id = users.id) AS customer_count,
        (SELECT COUNT(*) FROM refill_logs  WHERE user_id = users.id) AS refill_count
      FROM users ORDER BY created_at DESC
    `).all();
    const stats = { total: users.length, approved: users.filter(u=>u.status==='approved').length, pending: users.filter(u=>u.status==='pending').length, blocked: users.filter(u=>u.status==='blocked').length };
    res.json({ ok: true, data: users, stats });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.patch('/api/owner/users/:id/status', requireOwner, (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved','pending','blocked'].includes(status)) return res.status(400).json({ ok: false, error: 'Invalid status.' });
    if (!db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id)) return res.status(404).json({ ok: false, error: 'User not found.' });
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.delete('/api/owner/users/:id', requireOwner, (req, res) => {
  try {
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: 'Not found.' });
    if (user.role === 'owner') return res.status(403).json({ ok: false, error: 'Cannot delete owner.' });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/owner/stats', requireOwner, (req, res) => {
  try {
    const stats = db.prepare(`SELECT (SELECT COUNT(*) FROM users WHERE role != 'owner') AS total_users, (SELECT COUNT(*) FROM customers) AS total_customers, (SELECT COUNT(*) FROM refill_logs) AS total_refills`).get();
    res.json({ ok: true, data: stats });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, message: 'Gas Manager Pro API running!', time: new Date().toISOString() }));

app.use((req, res) => res.status(404).json({ ok: false, error: 'Route not found.' }));

// ── Start server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('  ⛽  Gas Manager Pro API');
  console.log('  🚀  Running at port ' + PORT);
  console.log('');
});
