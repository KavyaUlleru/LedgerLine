const { query } = require('../db');
const { logAuditEvent } = require('../utils/auditLogger');

/**
 * Controller: List all users, roles, and associated accounts (Admin only)
 */
async function listUsers(req, res, next) {
  try {
    const usersSql = `
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.role, 
        u.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', a.id,
              'accountNumber', a.account_number,
              'balance', a.balance::bigint,
              'accountType', a.account_type,
              'status', a.status
            )
          ) FILTER (WHERE a.id IS NOT NULL),
          '[]'
        ) AS accounts
      FROM users u
      LEFT JOIN accounts a ON a.owner_user_id = u.id
      GROUP BY u.id
      ORDER BY u.id ASC;
    `;

    const result = await query(usersSql);

    const users = result.rows.map((u) => ({
      ...u,
      accounts: (u.accounts || []).map((acc) => ({
        ...acc,
        balance: parseInt(acc.balance, 10),
      })),
    }));

    return res.status(200).json({ users });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Update account status (Freeze / Unfreeze / Close) (Admin only)
 */
async function updateAccountStatus(req, res, next) {
  try {
    const accountId = parseInt(req.params.id, 10);
    const { status, reason } = req.body;
    const adminId = req.user.id;

    const allowedStatuses = ['ACTIVE', 'FROZEN', 'CLOSED'];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}`,
      });
    }

    // Verify account exists
    const accCheck = await query('SELECT id, account_number, status, owner_user_id FROM accounts WHERE id = $1', [
      accountId,
    ]);

    if (accCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const previousStatus = accCheck.rows[0].status;

    // Update status
    const updateRes = await query(
      `UPDATE accounts 
       SET status = $1 
       WHERE id = $2 
       RETURNING id, account_number, status, balance;`,
      [status, accountId]
    );

    const updatedAccount = updateRes.rows[0];

    // Log administrative audit event
    await logAuditEvent({
      userId: adminId,
      accountId: updatedAccount.id,
      action: 'ACCOUNT_STATUS_CHANGE',
      outcome: 'SUCCESS',
      reason: `Account ${updatedAccount.account_number} status changed from ${previousStatus} to ${status}. Reason: ${reason || 'Administrative policy update'}`,
    });

    return res.status(200).json({
      message: `Account ${updatedAccount.account_number} status updated to ${status}`,
      account: {
        id: updatedAccount.id,
        accountNumber: updatedAccount.account_number,
        status: updatedAccount.status,
        balance: parseInt(updatedAccount.balance, 10),
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listUsers,
  updateAccountStatus,
};

