const { getClient, query } = require('../db');
const { logAuditEvent } = require('../utils/auditLogger');
const { generateRequestHash, getIdempotencyKey } = require('../middleware/idempotency');

/**
 * Helper to fetch system reserve account for double-entry deposit/withdrawal routing
 */
async function getSystemReserveAccount(client) {
  const res = await client.query(
    "SELECT id, balance, status FROM accounts WHERE account_type = 'SYSTEM_RESERVE' LIMIT 1"
  );
  if (res.rows.length === 0) {
    throw new Error('System Cash Reserve account not configured in database');
  }
  return res.rows[0];
}

/**
 * Controller: Execute an Account-to-Account Transfer
 * Financial Invariants:
 * - Deterministic lock ordering (ORDER BY id ASC FOR UPDATE)
 * - Strict Double-Entry symmetry (1 DEBIT + 1 CREDIT)
 * - Server-side negative balance prevention
 * - Full Idempotency with exact cached response on retries
 * - Refused attempts committed with 0 ledger entries
 */
async function transfer(req, res, next) {
  const { sourceAccountId, destinationAccountNumber, amount } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;
  const idempotencyKey = getIdempotencyKey(req);
  const requestHash = idempotencyKey ? generateRequestHash(req.originalUrl, req.body) : null;

  // 1. Input Validation
  const transferAmount = parseInt(amount, 10);
  if (!sourceAccountId || !destinationAccountNumber) {
    return res.status(400).json({ error: 'Source account ID and destination account number are required' });
  }

  if (isNaN(transferAmount) || transferAmount <= 0) {
    return res.status(400).json({ error: 'Transfer amount must be a positive integer in paise' });
  }

  // 2. Fast-path Idempotency Check (before starting transaction)
  if (idempotencyKey) {
    const existingKey = await query(
      'SELECT response_status, response_body, request_hash FROM idempotency_keys WHERE user_id = $1 AND idempotency_key = $2',
      [userId, idempotencyKey]
    );

    if (existingKey.rows.length > 0) {
      const savedKey = existingKey.rows[0];
      if (savedKey.request_hash !== requestHash) {
        return res.status(409).json({
          error: 'Conflict: Idempotency key was previously submitted with a different request payload',
        });
      }
      if (savedKey.response_status !== null) {
        return res.status(savedKey.response_status).json(savedKey.response_body);
      }
    }
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // 3. Atomically Claim Idempotency Key (First-come first-served)
    let idempotencyRowId = null;
    if (idempotencyKey) {
      const claimRes = await client.query(
        `INSERT INTO idempotency_keys (user_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, idempotency_key) DO NOTHING
         RETURNING id;`,
        [userId, idempotencyKey, requestHash]
      );

      if (claimRes.rows.length === 0) {
        // Another concurrent request claimed this key
        await client.query('ROLLBACK');
        // Retrieve the completed result
        const completedRes = await query(
          'SELECT response_status, response_body FROM idempotency_keys WHERE user_id = $1 AND idempotency_key = $2',
          [userId, idempotencyKey]
        );
        if (completedRes.rows.length > 0 && completedRes.rows[0].response_status) {
          return res.status(completedRes.rows[0].response_status).json(completedRes.rows[0].response_body);
        }
        return res.status(409).json({ error: 'Concurrent duplicate request in progress. Please retry.' });
      }
      idempotencyRowId = claimRes.rows[0].id;
    }

    // 4. Resolve Destination Account ID
    const destLookup = await client.query(
      'SELECT id, account_number, owner_user_id, status, account_type FROM accounts WHERE account_number = $1',
      [destinationAccountNumber.trim()]
    );

    if (destLookup.rows.length === 0) {
      return await handleRefusal(
        client,
        res,
        {
          sourceAccountId,
          destAccountId: null,
          transferAmount,
          userId,
          reason: 'DESTINATION_ACCOUNT_NOT_FOUND',
          message: `Destination account "${destinationAccountNumber}" does not exist`,
          statusCode: 404,
          idempotencyRowId,
        }
      );
    }

    const destAccountId = destLookup.rows[0].id;

    if (parseInt(sourceAccountId, 10) === destAccountId) {
      return await handleRefusal(
        client,
        res,
        {
          sourceAccountId,
          destAccountId,
          transferAmount,
          userId,
          reason: 'SELF_TRANSFER_PROHIBITED',
          message: 'Cannot transfer funds to the same account',
          statusCode: 400,
          idempotencyRowId,
        }
      );
    }

    // 5. Deterministic Row-Level Locking (Ascending ID Order)
    const srcId = parseInt(sourceAccountId, 10);
    const dstId = parseInt(destAccountId, 10);
    const sortedIds = [srcId, dstId].sort((a, b) => a - b);
    const lockedRes = await client.query(
      `SELECT id, account_number, owner_user_id, balance, status, account_type 
       FROM accounts 
       WHERE id = ANY($1::bigint[]) 
       ORDER BY id ASC 
       FOR UPDATE;`,
      [sortedIds]
    );

    const accountsMap = new Map(
      lockedRes.rows.map((acc) => [
        parseInt(acc.id, 10),
        {
          ...acc,
          id: parseInt(acc.id, 10),
          owner_user_id: parseInt(acc.owner_user_id, 10),
          balance: parseInt(acc.balance, 10),
        },
      ])
    );
    const sourceAccount = accountsMap.get(srcId);
    const destAccount = accountsMap.get(dstId);

    if (!sourceAccount) {
      return await handleRefusal(client, res, {
        sourceAccountId,
        destAccountId,
        transferAmount,
        userId,
        reason: 'SOURCE_ACCOUNT_NOT_FOUND',
        message: 'Source account not found',
        statusCode: 404,
        idempotencyRowId,
      });
    }

    // 6. Security Check: Ownership Verification (BOLA / IDOR Defense)
    if (userRole !== 'ADMIN' && parseInt(sourceAccount.owner_user_id, 10) !== parseInt(userId, 10)) {
      return await handleRefusal(client, res, {
        sourceAccountId: sourceAccount.id,
        destAccountId: destAccount.id,
        transferAmount,
        userId,
        reason: 'UNAUTHORIZED_SOURCE_ACCOUNT',
        message: 'Access denied: You do not own the source account',
        statusCode: 403,
        idempotencyRowId,
      });
    }

    // 7. Security Check: System Accounts Access Defense
    if (userRole !== 'ADMIN' && (sourceAccount.account_type !== 'STANDARD' || destAccount.account_type !== 'STANDARD')) {
      return await handleRefusal(client, res, {
        sourceAccountId: sourceAccount.id,
        destAccountId: destAccount.id,
        transferAmount,
        userId,
        reason: 'SYSTEM_ACCOUNT_ACCESS_DENIED',
        message: 'Direct transfers involving system clearing accounts are forbidden',
        statusCode: 403,
        idempotencyRowId,
      });
    }

    // 8. Account Status Check
    if (sourceAccount.status !== 'ACTIVE' || destAccount.status !== 'ACTIVE') {
      return await handleRefusal(client, res, {
        sourceAccountId: sourceAccount.id,
        destAccountId: destAccount.id,
        transferAmount,
        userId,
        reason: 'ACCOUNT_NOT_ACTIVE',
        message: 'One or both accounts are not active',
        statusCode: 400,
        idempotencyRowId,
      });
    }

    // 9. Server-Side Negative Balance Prevention
    const currentBalance = parseInt(sourceAccount.balance, 10);
    if (currentBalance < transferAmount) {
      return await handleRefusal(client, res, {
        sourceAccountId: sourceAccount.id,
        destAccountId: destAccount.id,
        transferAmount,
        userId,
        reason: 'INSUFFICIENT_FUNDS',
        message: `Insufficient funds: Available balance is ₹${(currentBalance / 100).toFixed(2)}, required ₹${(transferAmount / 100).toFixed(2)}`,
        statusCode: 400,
        idempotencyRowId,
      });
    }

    // 10. SUCCESS EXECUTION (Double-Entry Bookkeeping)
    // A. Insert Transaction Record
    const txInsertSql = `
      INSERT INTO transactions (transaction_type, amount, source_account_id, destination_account_id, status, initiated_by)
      VALUES ('TRANSFER', $1, $2, $3, 'SUCCESS', $4)
      RETURNING id, created_at;
    `;
    const txRes = await client.query(txInsertSql, [
      transferAmount,
      sourceAccount.id,
      destAccount.id,
      userId,
    ]);
    const transactionId = txRes.rows[0].id;

    // B. Insert Balancing Ledger Entries (DEBIT Source + CREDIT Destination)
    const ledgerSql = `
      INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount)
      VALUES 
        ($1, $2, 'DEBIT', $3),
        ($1, $4, 'CREDIT', $3);
    `;
    await client.query(ledgerSql, [transactionId, sourceAccount.id, transferAmount, destAccount.id]);

    // C. Update Current Balances
    await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [
      transferAmount,
      sourceAccount.id,
    ]);
    await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [
      transferAmount,
      destAccount.id,
    ]);

    // D. Write Audit Event
    await logAuditEvent(
      {
        userId,
        accountId: sourceAccount.id,
        action: 'TRANSFER',
        outcome: 'SUCCESS',
        reason: `Transferred ₹${(transferAmount / 100).toFixed(2)} to ${destAccount.account_number}`,
      },
      client
    );

    const newSourceBalance = currentBalance - transferAmount;
    const responsePayload = {
      message: 'Transfer completed successfully',
      status: 'SUCCESS',
      transactionId,
      amount: transferAmount,
      amountFormatted: `₹${(transferAmount / 100).toFixed(2)}`,
      sourceAccount: {
        id: sourceAccount.id,
        accountNumber: sourceAccount.account_number,
        newBalance: newSourceBalance,
      },
      destinationAccount: {
        accountNumber: destAccount.account_number,
      },
      createdAt: txRes.rows[0].created_at,
    };

    // E. Save Idempotency Result
    if (idempotencyRowId) {
      await client.query(
        `UPDATE idempotency_keys 
         SET response_status = 200, response_body = $1, transaction_id = $2 
         WHERE id = $3`,
        [responsePayload, transactionId, idempotencyRowId]
      );
    }

    await client.query('COMMIT');
    return res.status(200).json(responsePayload);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Controller: Deposit Funds (Routes via SYSTEM_RESERVE for complete double-entry conservation)
 */
async function deposit(req, res, next) {
  const { accountId, amount } = req.body;
  const userId = req.user.id;
  const depositAmount = parseInt(amount, 10);
  const idempotencyKey = getIdempotencyKey(req);
  const requestHash = idempotencyKey ? generateRequestHash(req.originalUrl, req.body) : null;

  if (!accountId || isNaN(depositAmount) || depositAmount <= 0) {
    return res.status(400).json({ error: 'Valid account ID and positive amount in paise are required' });
  }

  // Fast-path idempotency check
  if (idempotencyKey) {
    const existing = await query(
      'SELECT response_status, response_body, request_hash FROM idempotency_keys WHERE user_id = $1 AND idempotency_key = $2',
      [userId, idempotencyKey]
    );
    if (existing.rows.length > 0 && existing.rows[0].response_status) {
      if (existing.rows[0].request_hash !== requestHash) {
        return res.status(409).json({ error: 'Idempotency key reused with different request payload' });
      }
      return res.status(existing.rows[0].response_status).json(existing.rows[0].response_body);
    }
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    let idempotencyRowId = null;
    if (idempotencyKey) {
      const claim = await client.query(
        `INSERT INTO idempotency_keys (user_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, idempotency_key) DO NOTHING
         RETURNING id;`,
        [userId, idempotencyKey, requestHash]
      );
      if (claim.rows.length > 0) idempotencyRowId = claim.rows[0].id;
    }

    const systemReserve = await getSystemReserveAccount(client);
    const sortedIds = [parseInt(accountId, 10), systemReserve.id].sort((a, b) => a - b);

    const locked = await client.query(
      'SELECT id, account_number, owner_user_id, balance, status, account_type FROM accounts WHERE id = ANY($1::bigint[]) ORDER BY id ASC FOR UPDATE',
      [sortedIds]
    );

    const targetAccount = locked.rows.find((a) => parseInt(a.id, 10) === parseInt(accountId, 10));
    const reserveAccount = locked.rows.find((a) => parseInt(a.id, 10) === parseInt(systemReserve.id, 10));

    if (!targetAccount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Account not found' });
    }

    if (req.user.role !== 'ADMIN' && parseInt(targetAccount.owner_user_id, 10) !== parseInt(userId, 10)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied: You do not own this account' });
    }

    // Record Transaction
    const txRes = await client.query(
      `INSERT INTO transactions (transaction_type, amount, source_account_id, destination_account_id, status, initiated_by)
       VALUES ('DEPOSIT', $1, NULL, $2, 'SUCCESS', $3)
       RETURNING id, created_at;`,
      [depositAmount, targetAccount.id, userId]
    );
    const txId = txRes.rows[0].id;

    // Double-Entry Ledger (DEBIT Reserve -> CREDIT Customer)
    await client.query(
      `INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount)
       VALUES ($1, $2, 'DEBIT', $3), ($1, $4, 'CREDIT', $3);`,
      [txId, reserveAccount.id, depositAmount, targetAccount.id]
    );

    // Update balances
    await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [depositAmount, reserveAccount.id]);
    await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [depositAmount, targetAccount.id]);

    await logAuditEvent(
      {
        userId,
        accountId: targetAccount.id,
        action: 'DEPOSIT',
        outcome: 'SUCCESS',
        reason: `Deposited ₹${(depositAmount / 100).toFixed(2)} into ${targetAccount.account_number}`,
      },
      client
    );

    const newBalance = parseInt(targetAccount.balance, 10) + depositAmount;
    const responsePayload = {
      message: 'Deposit successful',
      status: 'SUCCESS',
      transactionId: txId,
      amount: depositAmount,
      amountFormatted: `₹${(depositAmount / 100).toFixed(2)}`,
      newBalance,
    };

    if (idempotencyRowId) {
      await client.query(
        'UPDATE idempotency_keys SET response_status = 200, response_body = $1, transaction_id = $2 WHERE id = $3',
        [responsePayload, txId, idempotencyRowId]
      );
    }

    await client.query('COMMIT');
    return res.status(200).json(responsePayload);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Controller: Withdraw Funds (Routes via SYSTEM_RESERVE for complete double-entry conservation)
 */
async function withdraw(req, res, next) {
  const { accountId, amount } = req.body;
  const userId = req.user.id;
  const withdrawAmount = parseInt(amount, 10);
  const idempotencyKey = getIdempotencyKey(req);
  const requestHash = idempotencyKey ? generateRequestHash(req.originalUrl, req.body) : null;

  if (!accountId || isNaN(withdrawAmount) || withdrawAmount <= 0) {
    return res.status(400).json({ error: 'Valid account ID and positive amount in paise are required' });
  }

  // Fast-path idempotency check
  if (idempotencyKey) {
    const existing = await query(
      'SELECT response_status, response_body, request_hash FROM idempotency_keys WHERE user_id = $1 AND idempotency_key = $2',
      [userId, idempotencyKey]
    );
    if (existing.rows.length > 0 && existing.rows[0].response_status) {
      if (existing.rows[0].request_hash !== requestHash) {
        return res.status(409).json({ error: 'Idempotency key reused with different request payload' });
      }
      return res.status(existing.rows[0].response_status).json(existing.rows[0].response_body);
    }
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    let idempotencyRowId = null;
    if (idempotencyKey) {
      const claim = await client.query(
        `INSERT INTO idempotency_keys (user_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, idempotency_key) DO NOTHING
         RETURNING id;`,
        [userId, idempotencyKey, requestHash]
      );
      if (claim.rows.length > 0) idempotencyRowId = claim.rows[0].id;
    }

    const systemReserve = await getSystemReserveAccount(client);
    const sortedIds = [parseInt(accountId, 10), systemReserve.id].sort((a, b) => a - b);

    const locked = await client.query(
      'SELECT id, account_number, owner_user_id, balance, status, account_type FROM accounts WHERE id = ANY($1::bigint[]) ORDER BY id ASC FOR UPDATE',
      [sortedIds]
    );

    const sourceAccount = locked.rows.find((a) => parseInt(a.id, 10) === parseInt(accountId, 10));
    const reserveAccount = locked.rows.find((a) => parseInt(a.id, 10) === parseInt(systemReserve.id, 10));

    if (!sourceAccount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Account not found' });
    }

    if (req.user.role !== 'ADMIN' && parseInt(sourceAccount.owner_user_id, 10) !== parseInt(userId, 10)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied: You do not own this account' });
    }

    const currentBalance = parseInt(sourceAccount.balance, 10);
    if (currentBalance < withdrawAmount) {
      return await handleRefusal(client, res, {
        sourceAccountId: sourceAccount.id,
        destAccountId: null,
        transferAmount: withdrawAmount,
        userId,
        reason: 'INSUFFICIENT_FUNDS',
        message: `Insufficient funds for withdrawal. Current balance: ₹${(currentBalance / 100).toFixed(2)}`,
        statusCode: 400,
        idempotencyRowId,
      });
    }

    // Record Transaction
    const txRes = await client.query(
      `INSERT INTO transactions (transaction_type, amount, source_account_id, destination_account_id, status, initiated_by)
       VALUES ('WITHDRAWAL', $1, $2, NULL, 'SUCCESS', $3)
       RETURNING id, created_at;`,
      [withdrawAmount, sourceAccount.id, userId]
    );
    const txId = txRes.rows[0].id;

    // Double-Entry Ledger (DEBIT Customer -> CREDIT Reserve)
    await client.query(
      `INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount)
       VALUES ($1, $2, 'DEBIT', $3), ($1, $4, 'CREDIT', $3);`,
      [txId, sourceAccount.id, withdrawAmount, reserveAccount.id]
    );

    // Update balances
    await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [withdrawAmount, sourceAccount.id]);
    await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [withdrawAmount, reserveAccount.id]);

    await logAuditEvent(
      {
        userId,
        accountId: sourceAccount.id,
        action: 'WITHDRAWAL',
        outcome: 'SUCCESS',
        reason: `Withdrew ₹${(withdrawAmount / 100).toFixed(2)} from ${sourceAccount.account_number}`,
      },
      client
    );

    const newBalance = currentBalance - withdrawAmount;
    const responsePayload = {
      message: 'Withdrawal successful',
      status: 'SUCCESS',
      transactionId: txId,
      amount: withdrawAmount,
      amountFormatted: `₹${(withdrawAmount / 100).toFixed(2)}`,
      newBalance,
    };

    if (idempotencyRowId) {
      await client.query(
        'UPDATE idempotency_keys SET response_status = 200, response_body = $1, transaction_id = $2 WHERE id = $3',
        [responsePayload, txId, idempotencyRowId]
      );
    }

    await client.query('COMMIT');
    return res.status(200).json(responsePayload);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Helper: Gracefully commit a business refusal without creating any ledger entries or updating balances
 */
async function handleRefusal(
  client,
  res,
  { sourceAccountId, destAccountId, transferAmount, userId, reason, message, statusCode, idempotencyRowId }
) {
  // 1. Record refused transaction in transactions table
  const txType = destAccountId ? 'TRANSFER' : sourceAccountId ? 'WITHDRAWAL' : 'DEPOSIT';
  const txSql = `
    INSERT INTO transactions (transaction_type, amount, source_account_id, destination_account_id, status, refusal_reason, initiated_by)
    VALUES ($1, $2, $3, $4, 'REFUSED', $5, $6)
    RETURNING id, created_at;
  `;
  const txRes = await client.query(txSql, [
    txType,
    transferAmount || 1,
    sourceAccountId || null,
    destAccountId || null,
    reason,
    userId,
  ]);
  const transactionId = txRes.rows[0].id;

  // 2. Log denied audit event
  await logAuditEvent(
    {
      userId,
      accountId: sourceAccountId || destAccountId,
      action: txType,
      outcome: 'DENIED',
      reason: `${reason}: ${message}`,
    },
    client
  );

  const errorPayload = {
    error: message,
    status: 'REFUSED',
    reason,
    transactionId,
  };

  // 3. Save idempotency record so retries return the exact refusal
  if (idempotencyRowId) {
    await client.query(
      `UPDATE idempotency_keys 
       SET response_status = $1, response_body = $2, transaction_id = $3 
       WHERE id = $4`,
      [statusCode, errorPayload, transactionId, idempotencyRowId]
    );
  }

  // 4. Commit refusal records (0 ledger entries, 0 balance changes)
  await client.query('COMMIT');
  return res.status(statusCode).json(errorPayload);
}

module.exports = {
  transfer,
  deposit,
  withdraw,
};
