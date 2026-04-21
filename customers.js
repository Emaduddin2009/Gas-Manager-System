// ============================================================
//  CUSTOMERS ROUTES  — full CRUD + refill history
//  All queries are scoped to req.user.userId (data isolation)
//
//  GET    /api/customers            list all for logged-in user
//  POST   /api/customers            create new customer
//  GET    /api/customers/:id        get one customer (with history)
//  PUT    /api/customers/:id        update customer
//  DELETE /api/customers/:id        delete customer
//  POST   /api/customers/:id/refill add refill log entry
//  GET    /api/customers/:id/refills list refill history
// ============================================================
const express = require('express');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');
const router  = express.Router();

// ── LIST ─────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  try {
    const customers = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM refill_logs r WHERE r.customer_id = c.id) AS refill_count,
        (SELECT refilled_at FROM refill_logs r WHERE r.customer_id = c.id ORDER BY refilled_at DESC LIMIT 1) AS last_refill
      FROM customers c
      WHERE c.user_id = ?
      ORDER BY c.name ASC
    `).all(req.user.userId);
    res.json({ ok: true, data: customers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET ONE ──────────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  try {
    const customer = db.prepare(
      'SELECT * FROM customers WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.userId);

    if (!customer)
      return res.status(404).json({ ok: false, error: 'Customer not found.' });

    const history = db.prepare(
      'SELECT * FROM refill_logs WHERE customer_id = ? ORDER BY refilled_at DESC'
    ).all(req.params.id);

    res.json({ ok: true, data: { ...customer, history } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── CREATE ───────────────────────────────────────────────────
router.post('/', requireAuth, (req, res) => {
  try {
    const { name, cid, phone, address, addon, buy_date, pipe_expiry, paper_loc, photo_url, paper_photo_url } = req.body;

    if (!name || !name.trim())
      return res.status(400).json({ ok: false, error: 'Customer name is required.' });

    const result = db.prepare(`
      INSERT INTO customers (user_id, name, cid, phone, address, addon, buy_date, pipe_expiry, paper_loc, photo_url, paper_photo_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.userId,
      name.trim(), cid || null, phone || null, address || null,
      addon || null, buy_date || null, pipe_expiry || null,
      paper_loc || 'My Home', photo_url || null, paper_photo_url || null
    );

    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── UPDATE ───────────────────────────────────────────────────
router.put('/:id', requireAuth, (req, res) => {
  try {
    // Confirm ownership before update
    const existing = db.prepare(
      'SELECT id FROM customers WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.userId);

    if (!existing)
      return res.status(404).json({ ok: false, error: 'Customer not found.' });

    const { name, cid, phone, address, addon, buy_date, pipe_expiry, paper_loc, photo_url, paper_photo_url } = req.body;

    db.prepare(`
      UPDATE customers
      SET name=?, cid=?, phone=?, address=?, addon=?, buy_date=?, pipe_expiry=?,
          paper_loc=?, photo_url=?, paper_photo_url=?, updated_at=CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(
      name, cid || null, phone || null, address || null, addon || null,
      buy_date || null, pipe_expiry || null, paper_loc || 'My Home',
      photo_url || null, paper_photo_url || null,
      req.params.id, req.user.userId
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DELETE ───────────────────────────────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const result = db.prepare(
      'DELETE FROM customers WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user.userId);

    if (result.changes === 0)
      return res.status(404).json({ ok: false, error: 'Customer not found.' });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── ADD REFILL ───────────────────────────────────────────────
router.post('/:id/refill', requireAuth, (req, res) => {
  try {
    const customer = db.prepare(
      'SELECT id FROM customers WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.userId);

    if (!customer)
      return res.status(404).json({ ok: false, error: 'Customer not found.' });

    const { note } = req.body;
    const result = db.prepare(
      'INSERT INTO refill_logs (customer_id, user_id, note) VALUES (?, ?, ?)'
    ).run(req.params.id, req.user.userId, note || null);

    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── REFILL HISTORY ───────────────────────────────────────────
router.get('/:id/refills', requireAuth, (req, res) => {
  try {
    const customer = db.prepare(
      'SELECT id FROM customers WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.userId);

    if (!customer)
      return res.status(404).json({ ok: false, error: 'Customer not found.' });

    const logs = db.prepare(
      'SELECT * FROM refill_logs WHERE customer_id = ? ORDER BY refilled_at DESC'
    ).all(req.params.id);

    res.json({ ok: true, data: logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── ANALYSIS: refills in date range ─────────────────────────
router.get('/analysis/range', requireAuth, (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to)
      return res.status(400).json({ ok: false, error: 'from and to dates required.' });

    const results = db.prepare(`
      SELECT c.id, c.name, c.cid, c.phone, c.photo_url,
        COUNT(r.id) AS refill_count,
        GROUP_CONCAT(r.refilled_at, '||') AS refill_dates
      FROM customers c
      JOIN refill_logs r ON r.customer_id = c.id
      WHERE c.user_id = ?
        AND DATE(r.refilled_at) BETWEEN DATE(?) AND DATE(?)
      GROUP BY c.id
      ORDER BY refill_count DESC
    `).all(req.user.userId, from, to);

    const totalRefills = results.reduce((s, r) => s + r.refill_count, 0);
    res.json({ ok: true, data: results, totalRefills, customerCount: results.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
