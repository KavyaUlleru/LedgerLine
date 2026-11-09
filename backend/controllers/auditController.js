const { query } = require('../db');

/**
 * Controller: Get audit logs with optional filters (Admin & Auditor only)
 */
async function getAuditLogs(req, res, next) {
  try {
    const { action, outcome, limit = 100 } = req.query;

    const sql = `
      SELECT 
        ae.id,
        ae.user_id,
        ae.account_id,
        ae.action,
        ae.outcome,
        ae.reason,
        ae.created_at,
        u.name AS user_name,
        u.email AS user_email,
        u.role AS user_role,
        a.account_number
      FROM audit_events ae
      LEFT JOIN users u ON u.id = ae.user_id
      LEFT JOIN accounts a ON a.id = ae.account_id
      WHERE ($1::varchar IS NULL OR ae.action = $1)
        AND ($2::varchar IS NULL OR ae.outcome = $2)
      ORDER BY ae.created_at DESC, ae.id DESC
      LIMIT $3;
    `;

    const result = await query(sql, [action || null, outcome || null, parseInt(limit, 10)]);

    return res.status(200).json({
      totalLogs: result.rows.length,
      logs: result.rows,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Real-time Mathematical Double-Entry Reconciliation Audit
 * Proves that:
 * 1. Total debits == Total credits across the entire journal
 * 2. Net sum of all account balances == 0
 * 3. Every individual transaction is internally balanced
 */
async function getReconciliation(req, res, next) {
  try {
    // 1. Total Debits vs Total Credits
    const ledgerCheck = await query(`
      SELECT 
        COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) AS total_debits,
        COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) AS total_credits,
        COUNT(*) AS total_entries
      FROM ledger_entries;
    `);

    const totalDebits = parseInt(ledgerCheck.rows[0].total_debits, 10);
    const totalCredits = parseInt(ledgerCheck.rows[0].total_credits, 10);
    const totalEntries = parseInt(ledgerCheck.rows[0].total_entries, 10);
    const ledgerDiscrepancy = totalDebits - totalCredits;

    // 2. Net Balance of all Accounts (Assets = Liabilities + Equity)
    const accountsCheck = await query(`
      SELECT 
        COALESCE(SUM(balance), 0) AS net_system_balance,
        COUNT(*) AS total_accounts,
        COALESCE(SUM(CASE WHEN account_type = 'STANDARD' THEN balance ELSE 0 END), 0) AS customer_deposits,
        COALESCE(SUM(CASE WHEN account_type = 'SYSTEM_RESERVE' THEN balance ELSE 0 END), 0) AS reserve_vault,
        COALESCE(SUM(CASE WHEN account_type = 'SYSTEM_EQUITY' THEN balance ELSE 0 END), 0) AS equity_offset
      FROM accounts;
    `);

    const netSystemBalance = parseInt(accountsCheck.rows[0].net_system_balance, 10);
    const totalAccounts = parseInt(accountsCheck.rows[0].total_accounts, 10);
    const customerDeposits = parseInt(accountsCheck.rows[0].customer_deposits, 10);
    const reserveVault = parseInt(accountsCheck.rows[0].reserve_vault, 10);
    const equityOffset = parseInt(accountsCheck.rows[0].equity_offset, 10);

    // 3. Check for any individually unbalanced transactions
    const unbalancedCheck = await query(`
      SELECT 
        transaction_id,
        SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) AS debits,
        SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) AS credits
      FROM ledger_entries
      GROUP BY transaction_id
      HAVING SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) <> SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END);
    `);

    const hasDiscrepancy =
      ledgerDiscrepancy !== 0 ||
      netSystemBalance !== 0 ||
      unbalancedCheck.rows.length > 0;

    return res.status(200).json({
      auditStatus: hasDiscrepancy ? 'COMPROMISED' : 'VERIFIED_BALANCED',
      moneyConservationHolds: !hasDiscrepancy,
      timestamp: new Date().toISOString(),
      summary: {
        totalDebitsPaise: totalDebits,
        totalDebitsINR: `₹${(totalDebits / 100).toFixed(2)}`,
        totalCreditsPaise: totalCredits,
        totalCreditsINR: `₹${(totalCredits / 100).toFixed(2)}`,
        discrepancyPaise: ledgerDiscrepancy,
        totalLedgerEntries: totalEntries,
      },
      systemBalanceBreakdown: {
        totalAccounts,
        customerDepositsINR: `₹${(customerDeposits / 100).toFixed(2)}`,
        reserveVaultINR: `₹${(reserveVault / 100).toFixed(2)}`,
        equityOffsetINR: `₹${(equityOffset / 100).toFixed(2)}`,
        netSumPaise: netSystemBalance,
      },
      unbalancedTransactionsCount: unbalancedCheck.rows.length,
      unbalancedTransactions: unbalancedCheck.rows,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAuditLogs,
  getReconciliation,
};

