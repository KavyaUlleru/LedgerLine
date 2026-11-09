const request = require('supertest');
const app = require('../server');
const { pool, query } = require('../db');

describe('Task 2: Core Financial Ledger Engine, Concurrency & Idempotency', () => {
  let aliceToken = '';
  let bobToken = '';
  let aliceAccountId = null;
  let bobAccountId = null;
  const bobAccountNumber = 'ACC-1002';
  const aliceAccountNumber = 'ACC-1001';

  beforeAll(async () => {
    // 1. Authenticate Alice (Account Holder)
    const aliceLogin = await request(app).post('/api/auth/login').send({
      email: 'alice@ledgerline.local',
      password: 'Alice123!',
    });
    aliceToken = aliceLogin.body.token;
    aliceAccountId = aliceLogin.body.accounts.find((a) => a.accountNumber === aliceAccountNumber)?.id;

    // 2. Authenticate Bob (Account Holder)
    const bobLogin = await request(app).post('/api/auth/login').send({
      email: 'bob@ledgerline.local',
      password: 'Bob123!',
    });
    bobToken = bobLogin.body.token;
    bobAccountId = bobLogin.body.accounts.find((a) => a.accountNumber === bobAccountNumber)?.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('1. Account Retrieval & Statement Views', () => {
    it('GET /api/accounts should return authenticated user accounts', async () => {
      const res = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.accounts).toBeInstanceOf(Array);
      expect(res.body.accounts[0].account_number).toBe(aliceAccountNumber);
    });

    it('GET /api/accounts/:id/statement should return ledger statement with running balances', async () => {
      const res = await request(app)
        .get(`/api/accounts/${aliceAccountId}/statement`)
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.account).toBeDefined();
      expect(res.body.statement).toBeInstanceOf(Array);
    });
  });

  describe('2. Double-Entry Transfer & Money Conservation', () => {
    it('should successfully execute transfer from Alice to Bob with balanced debit and credit entries', async () => {
      const transferPaise = 10000; // ₹100.00
      const idempotencyKey = `transfer_test_${Date.now()}`;

      // Get pre-transfer balances
      const preAlice = await query('SELECT balance FROM accounts WHERE id = $1', [aliceAccountId]);
      const preBob = await query('SELECT balance FROM accounts WHERE id = $1', [bobAccountId]);
      const initialAlice = parseInt(preAlice.rows[0].balance, 10);
      const initialBob = parseInt(preBob.rows[0].balance, 10);

      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${aliceToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          sourceAccountId: aliceAccountId,
          destinationAccountNumber: bobAccountNumber,
          amount: transferPaise,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('SUCCESS');
      expect(res.body.transactionId).toBeDefined();

      // Check post-transfer balances
      const postAlice = await query('SELECT balance FROM accounts WHERE id = $1', [aliceAccountId]);
      const postBob = await query('SELECT balance FROM accounts WHERE id = $1', [bobAccountId]);
      expect(parseInt(postAlice.rows[0].balance, 10)).toBe(initialAlice - transferPaise);
      expect(parseInt(postBob.rows[0].balance, 10)).toBe(initialBob + transferPaise);

      // Verify double-entry ledger records
      const ledgerCheck = await query(
        `SELECT entry_type, amount, account_id 
         FROM ledger_entries 
         WHERE transaction_id = $1 
         ORDER BY id ASC;`,
        [res.body.transactionId]
      );

      expect(ledgerCheck.rows.length).toBe(2);
      expect(ledgerCheck.rows[0].entry_type).toBe('DEBIT');
      expect(parseInt(ledgerCheck.rows[0].amount, 10)).toBe(transferPaise);
      expect(parseInt(ledgerCheck.rows[0].account_id, 10)).toBe(parseInt(aliceAccountId, 10));

      expect(ledgerCheck.rows[1].entry_type).toBe('CREDIT');
      expect(parseInt(ledgerCheck.rows[1].amount, 10)).toBe(transferPaise);
      expect(parseInt(ledgerCheck.rows[1].account_id, 10)).toBe(parseInt(bobAccountId, 10));
    });
  });

  describe('3. Server-Side Negative Balance Prevention & Refusal Recording', () => {
    it('should refuse transfer when source account has insufficient funds (zero ledger entries)', async () => {
      const preAlice = await query('SELECT balance FROM accounts WHERE id = $1', [aliceAccountId]);
      const currentAlice = parseInt(preAlice.rows[0].balance, 10);
      const excessiveAmount = currentAlice + 500000; // Higher than available

      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          sourceAccountId: aliceAccountId,
          destinationAccountNumber: bobAccountNumber,
          amount: excessiveAmount,
        });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('REFUSED');
      expect(res.body.reason).toBe('INSUFFICIENT_FUNDS');
      expect(res.body.transactionId).toBeDefined();

      // Verify ZERO ledger entries created
      const entriesRes = await query('SELECT COUNT(*) FROM ledger_entries WHERE transaction_id = $1', [
        res.body.transactionId,
      ]);
      expect(parseInt(entriesRes.rows[0].count, 10)).toBe(0);

      // Verify balance did not change
      const postAlice = await query('SELECT balance FROM accounts WHERE id = $1', [aliceAccountId]);
      expect(parseInt(postAlice.rows[0].balance, 10)).toBe(currentAlice);
    });
  });

  describe('4. Idempotency Protection', () => {
    it('identical retry with same idempotency key should return original result without duplicate deduction', async () => {
      const transferPaise = 5000; // ₹50.00
      const idempotencyKey = `idemp_unique_${Date.now()}`;

      // Request 1: Original execution
      const res1 = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${aliceToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          sourceAccountId: aliceAccountId,
          destinationAccountNumber: bobAccountNumber,
          amount: transferPaise,
        });

      expect(res1.status).toBe(200);
      const originalTxId = res1.body.transactionId;

      const preBalance = await query('SELECT balance FROM accounts WHERE id = $1', [aliceAccountId]);

      // Request 2: Identical retry
      const res2 = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${aliceToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          sourceAccountId: aliceAccountId,
          destinationAccountNumber: bobAccountNumber,
          amount: transferPaise,
        });

      expect(res2.status).toBe(200);
      expect(res2.body.transactionId).toBe(originalTxId);

      // Verify balance was NOT deducted a second time
      const postBalance = await query('SELECT balance FROM accounts WHERE id = $1', [aliceAccountId]);
      expect(parseInt(postBalance.rows[0].balance, 10)).toBe(parseInt(preBalance.rows[0].balance, 10));
    });

    it('reusing idempotency key with modified payload should return HTTP 409 Conflict', async () => {
      const idempotencyKey = `tamper_test_${Date.now()}`;

      // Request 1
      await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${aliceToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          sourceAccountId: aliceAccountId,
          destinationAccountNumber: bobAccountNumber,
          amount: 2000,
        });

      // Request 2 with tampered amount
      const resTamper = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${aliceToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          sourceAccountId: aliceAccountId,
          destinationAccountNumber: bobAccountNumber,
          amount: 999999, // Tampered payload
        });

      expect(resTamper.status).toBe(409);
      expect(resTamper.body.error).toMatch(/different request payload/i);
    });
  });

  describe('5. Account-Level Authorization (BOLA / IDOR Defense)', () => {
    it('Bob should NOT be allowed to initiate a transfer from Alice account (HTTP 403)', async () => {
      const res = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${bobToken}`) // Bob token
        .send({
          sourceAccountId: aliceAccountId, // Alice's account!
          destinationAccountNumber: bobAccountNumber,
          amount: 1000,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/do not own the source account/i);
    });
  });

  describe('6. Ledger Immutability Trigger', () => {
    it('should reject UPDATE operations on ledger_entries at the database trigger level', async () => {
      await expect(
        query('UPDATE ledger_entries SET amount = amount + 1000 WHERE id = 1')
      ).rejects.toThrow(/strictly append-only/i);
    });

    it('should reject DELETE operations on ledger_entries at the database trigger level', async () => {
      await expect(
        query('DELETE FROM ledger_entries WHERE id = 1')
      ).rejects.toThrow(/strictly append-only/i);
    });
  });
});
