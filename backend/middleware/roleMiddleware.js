/**
 * Reusable role guard. Must run after `protect` (authMiddleware.js), which
 * sets req.user from the verified JWT. Authorization (what a role can do)
 * is intentionally kept separate from authentication (who you are).
 *
 * Usage: router.get('/path', protect, requireRole('department'), handler)
 */

const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to access this resource' });
  }
  next();
};

module.exports = { requireRole };
