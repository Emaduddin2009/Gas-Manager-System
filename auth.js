// ============================================================
//  AUTH MIDDLEWARE
//  Verifies JWT on every protected route.
//  Attaches req.user = { userId, username, role }
// ============================================================
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'No token provided.' });
  }

  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token.' });
  }
}

function requireOwner(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ ok: false, error: 'Owner access only.' });
    }
    next();
  });
}

module.exports = { requireAuth, requireOwner };
