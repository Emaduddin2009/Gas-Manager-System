// ============================================================
//  OWNER ROUTES — manage user accounts
//  All routes require role === 'owner'
//
//  GET   /api/owner/users           list all users
//  PATCH /api/owner/users/:id/status  approve / block / pending
//  DELETE /api/owner/users/:id      remove a user account
// ============================================================
const express = require('express');
const db      = require('../db');
const { requireOwner } = require('../middleware/auth');
const router  = express.Router();

// ── LIST USERS ───────────────────────────────────────────────
router.get('/users', requireOwner, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.name, u.username, u.role, u.status, u.created_at,
        (SELECT COUNT(*) FROM customers c WHERE c.user_id = u.id) AS customer_count
      FROM users u
      ORDER BY u.created_at DESC
    `).all();

    const summary = {
      total:    users.length,
      approved: users.filter(u => u.status === 'approved').length,
      pending:  users.filter(u => u.status === 'pending').length,
      blocked:  users.filter(u => u.status === 'blocked').length,
    };

    res.json({ ok: true, data: users, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── UPDATE STATUS ─────────────────────────────────────────────
router.patch('/users/:id/status', requireOwner, (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['approved', 'pending', 'blocked'];
    if (!allowed.includes(status))
      return res.status(400).json({ ok: false, error: `Status must be one of: ${allowed.join(', ')}` });

    const result = db.prepare(
      "UPDATE users SET status = ? WHERE id = ? AND role != 'owner'"
    ).run(status, req.params.id);

    if (result.changes === 0)
      return res.status(404).json({ ok: false, error: 'User not found.' });

    res.json({ ok: true, message: `User status set to ${status}.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DELETE USER ───────────────────────────────────────────────
router.delete('/users/:id', requireOwner, (req, res) => {
  try {
    const result = db.prepare(
      "DELETE FROM users WHERE id = ? AND role != 'owner'"
    ).run(req.params.id);

    if (result.changes === 0)
      return res.status(404).json({ ok: false, error: 'User not found.' });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
