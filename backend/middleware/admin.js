/**
 * Middleware: Require Administrator privileges.
 * Validates isAdmin against the freshly loaded user document from MongoDB.
 */
export const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.user.isAdmin) {
      return res.status(403).json({
        error: 'Access denied: Administrator privileges required',
        code: 'FORBIDDEN',
      });
    }

    next();
  } catch (err) {
    console.error('Admin authorization error:', err);
    return res.status(500).json({ error: 'Internal server error during authorization' });
  }
};
