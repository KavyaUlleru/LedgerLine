const crypto = require('crypto');

/**
 * Generate a consistent SHA-256 hash from request path and payload
 */
function generateRequestHash(path, body) {
  const content = `${path}:${JSON.stringify(body || {})}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Extract or generate client idempotency key
 */
function getIdempotencyKey(req) {
  return req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || null;
}

module.exports = {
  generateRequestHash,
  getIdempotencyKey,
};

