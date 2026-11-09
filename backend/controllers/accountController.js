const { query } = require('../db');

/**
 * Controller: Get accounts visible to the authenticated user
 */
async function getAccounts(req, res, next) {
  try {
    const { role, id: userId } = req.user;

    let sql;
    let params = [];

    if (role === 'ADMIN' || role === 'AUDITOR') {
      // Admins and Auditors can see all accounts
      sql = `
        SELECT a.id, a.account_number, a.owner_user_id, a.balance, a.account_type, a.status, a.created_at,
               u.name AS owner_name, u.email AS owner_email
        FROM accounts a
        JOIN users u ON u.id = a.owner_user_id
        ORDER BY a.id ASC;
      `;
    } else {
      // Account holders only see their own accounts
      sql = `
        SELECT a.id, a.account_number, a.owner_user_id, a.balance, a.account_type, a.status, a.created_at
        FROM accounts a
        WHERE a.owner_user_id = $1
        ORDER BY a.id ASC;
      `;
      params = [userId];
    }

    const result = await query(sql, params);
    const accounts = result.rows.map((acc) => ({
      ...acc,
      balance: parseInt(acc.balance, 10),
    }));

    return res.status(200).json({ accounts });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Get specific account details by ID
 */
async function getAccountById(req, res, next) {
  try {
    const accountId = parseInt(req.params.id, 10);
    const { role, id: userId } = req.user;

    const result = await query(
      `SELECT a.id, a.account_number, a.owner_user_id, a.balance, a.account_type, a.status, a.created_at,
              u.name AS owner_name, u.email AS owner_email
       FROM accounts a
       JOIN users u ON u.id = a.owner_user_id
       WHERE a.id = $1;`,
      [accountId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = result.rows[0];

    // Authorization check (BOLA / IDOR protection)
    if (role !== 'ADMIN' && role !== 'AUDITOR' && account.owner_user_id !== userId) {
      return res.status(403).json({ error: 'Access denied: You do not own this account' });
    }

    return res.status(200).json({
      account: {
        ...account,
        balance: parseInt(account.balance, 10),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Get official statement & running ledger history for an account
 */
async function getAccountStatement(req, res, next) {
  try {
    const accountId = parseInt(req.params.id, 10);
    const { role, id: userId } = req.user;

    // 1. Verify account existence & authorization
    const accountRes = await query(
      'SELECT id, account_number, owner_user_id, balance, account_type, status FROM accounts WHERE id = $1',
      [accountId]
    );

    if (accountRes.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = accountRes.rows[0];

    if (role !== 'ADMIN' && role !== 'AUDITOR' && account.owner_user_id !== userId) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to view this statement' });
    }

    // 2. Fetch all append-only ledger entries for this account
    const entriesSql = `
      SELECT 
        le.id AS entry_id,
        le.transaction_id,
        le.entry_type,
        le.amount,
        le.created_at,
        t.transaction_type,
        t.status AS transaction_status,
        t.source_account_id,
        t.destination_account_id,
        src.account_number AS source_account_number,
        dst.account_number AS destination_account_number
      FROM ledger_entries le
      JOIN transactions t ON t.id = le.transaction_id
      LEFT JOIN accounts src ON src.id = t.source_account_id
      LEFT JOIN accounts dst ON dst.id = t.destination_account_id
      WHERE le.account_id = $1
      ORDER BY le.created_at ASC, le.id ASC;
    `;

    const entriesRes = await query(entriesSql, [accountId]);

    // 3. Compute running balance for each historical entry
    let runningBalance = 0;
    const statementEntries = entriesRes.rows.map((entry) => {
      const amount = parseInt(entry.amount, 10);
      if (entry.entry_type === 'CREDIT') {
        runningBalance += amount;
      } else {
        runningBalance -= amount;
      }

      return {
        id: entry.entry_id,
        transactionId: entry.transaction_id,
        transactionType: entry.transaction_type,
        entryType: entry.entry_type,
        amount,
        runningBalance,
        counterpartAccount:
          entry.entry_type === 'DEBIT'
            ? entry.destination_account_number || 'External'
            : entry.source_account_number || 'External',
        createdAt: entry.created_at,
      };
    });

    return res.status(200).json({
      account: {
        id: account.id,
        accountNumber: account.account_number,
        currentBalance: parseInt(account.balance, 10),
        status: account.status,
      },
      statement: statementEntries.reverse(), // Newest transactions first for presentation
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAccounts,
  getAccountById,
  getAccountStatement,
};

