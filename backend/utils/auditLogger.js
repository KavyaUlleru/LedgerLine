const { query } = require('../db');

/**
 * Utility: Record an operational or security event into the audit_events table.
 *
 * @param {Object} event
 * @param {number|null} [event.userId=null] - User ID associated with event
 * @param {number|null} [event.accountId=null] - Account ID involved
 * @param {string} event.action - Action performed (e.g., 'LOGIN', 'REGISTER', 'UNAUTHORIZED_ACCESS')
 * @param {string} event.outcome - Outcome ('SUCCESS', 'DENIED', 'FAILED')
 * @param {string} event.reason - Human-readable reason or details
 * @param {object} [client=null] - Optional active database transaction client
 */
async function logAuditEvent({ userId = null, accountId = null, action, outcome, reason }, client = null) {
  const sql = `
    INSERT INTO audit_events (user_id, account_id, action, outcome, reason)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, created_at;
  `;
  const params = [userId, accountId, action, outcome, reason];

  try {
    if (client) {
      return await client.query(sql, params);
    } else {
      return await query(sql, params);
    }
  } catch (error) {
    // Non-fatal logging failure to server log
    console.error('Failed to write audit event:', error.message);
  }
}

module.exports = { logAuditEvent };

