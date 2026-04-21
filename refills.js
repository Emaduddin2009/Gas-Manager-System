// =============================================
//  Refill Routes: /api/customers/:id/refills
// =============================================
const express = require('express');
const router  = express.Router({ mergeParams: true }); // gets :id from parent
const db      = require('../db');
const { requireApproved } = require('../middleware/auth');

router.use(requireApproved);

// ── GET /api/customers/:id/refills ── list history for a customer ─────────────
router.get('/', (req, res) => {
  try {
    // Security: verify the customer belongs to this user
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
    res.status(500).json({ ok: false, error: 'Failed to fetch refill history.' });
  }
});

// ── POST /api/customers/:id/refills ── log a new refill ──────────────────────
router.post('/', (req, res) => {
  try {
    const customer = db.prepare(
      'SELECT id FROM customers WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.userId);

    if (!customer)
      return res.status(404).json({ ok: false, error: 'Customer not found.' });

    const { refilled_at, note } = req.body;

    const result = db.prepare(`
      INSERT INTO refill_logs (customer_id, user_id, refilled_at, note)
      VALUES (?, ?, ?, ?)
    `).run(
      req.params.id,
      req.user.userId,
      refilled_at || new Date().toISOString(),
      note || null
    );

    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to log refill.' });
  }
});

// ── DELETE /api/customers/:id/refills/:logId ── delete one refill entry ────────
router.delete('/:logId', (req, res) => {
  try {
    // Verify ownership via JOIN — user can only delete their own customer's logs
    const log = db.prepare(`
      SELECT r.id FROM refill_logs r
      JOIN customers c ON c.id = r.customer_id
      WHERE r.id = ? AND c.user_id = ?
    `).get(req.params.logId, req.user.userId);

    if (!log)
      return res.status(404).json({ ok: false, error: 'Refill log not found.' });

    db.prepare('DELETE FROM refill_logs WHERE id = ?').run(req.params.logId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to delete refill log.' });
  }
});

// ── GET /api/customers/:id/refills/range ── analysis date-range query ─────────
router.get('/range', (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to)
      return res.status(400).json({ ok: false, error: 'from and to query params required.' });

    // All refills across all this user's customers within a date range
    const results = db.prepare(`
      SELECT
        c.id AS customer_id, c.name, c.cid, c.phone, c.photo_data,
        COUNT(r.id) AS refill_count,
        GROUP_CONCAT(r.refilled_at, '||') AS refill_dates
      FROM customers c
      JOIN refill_logs r ON r.customer_id = c.id
      WHERE c.user_id = ?
        AND r.refilled_at BETWEEN ? AND ?
      GROUP BY c.id
      ORDER BY refill_count DESC
    `).all(req.user.userId, from + 'T00:00:00', to + 'T23:59:59');

    const totalRefills = results.reduce((sum, r) => sum + r.refill_count, 0);

    res.json({ ok: true, data: results, totalRefills, customerCount: results.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Analysis query failed.' });
  }
});

module.exports = router;
