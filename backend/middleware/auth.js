const jwt = require('jsonwebtoken');

// JWT Secret Key from environment variables with fallback
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_ledgerline_jwt_key_2026!';

/**
 * Middleware: Authenticate JWT Token
 * Extracts Bearer token from Authorization header, verifies signature,
 * and attaches decoded payload (id, name, email, role) to req.user.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({
      error: 'Access denied: Authentication token required',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      error: 'Access denied: Invalid or expired authentication token',
    });
  }
}

/**
 * Middleware: Role-Based Access Control (RBAC)
 * Verifies that the authenticated caller has one of the allowed roles.
 * @param {...string} allowedRoles - E.g. 'ADMIN', 'AUDITOR', 'ACCOUNT_HOLDER'
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'User is not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Role '${req.user.role}' is not authorized to access this resource`,
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole,
  JWT_SECRET,
};

