const request = require('supertest');
const app = require('../server');
const { pool } = require('../db');

describe('Task 3: Admin & Audit Oversight Features', () => {
  let adminToken = '';
  let auditorToken = '';
  let aliceToken = '';
  let aliceAccountId = null;

  beforeAll(async () => {
    // 1. Admin login
    const adminRes = await request(app).post('/api/auth/login').send({
      email: 'admin@ledgerline.local',
      password: 'Admin123!',
    });
    adminToken = adminRes.body.token;

    // 2. Auditor login
    const auditorRes = await request(app).post('/api/auth/login').send({
      email: 'auditor@ledgerline.local',
      password: 'Auditor123!',
    });
    auditorToken = auditorRes.body.token;

    // 3. Alice login
    const aliceRes = await request(app).post('/api/auth/login').send({
      email: 'alice@ledgerline.local',
      password: 'Alice123!',
    });
    aliceToken = aliceRes.body.token;
    aliceAccountId = aliceRes.body.accounts[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('1. Admin User & Account Management', () => {
    it('GET /api/admin/users should allow ADMIN to list all registered users', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.users).toBeInstanceOf(Array);
      expect(res.body.users.length).toBeGreaterThan(0);
      expect(res.body.users[0].role).toBeDefined();
    });

    it('GET /api/admin/users should forbid ACCOUNT_HOLDER (HTTP 403)', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(403);
    });

    it('PATCH /api/admin/accounts/:id/status should allow ADMIN to freeze and unfreeze an account', async () => {
      // 1. Freeze Alice's account
      const freezeRes = await request(app)
        .patch(`/api/admin/accounts/${aliceAccountId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'FROZEN', reason: 'Compliance test hold' });

      expect(freezeRes.status).toBe(200);
      expect(freezeRes.body.account.status).toBe('FROZEN');

      // 2. Attempt transfer from frozen account -> must be refused!
      const transferRes = await request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          sourceAccountId: aliceAccountId,
          destinationAccountNumber: 'ACC-1002',
          amount: 500,
        });

      expect(transferRes.status).toBe(400);
      expect(transferRes.body.reason).toBe('ACCOUNT_NOT_ACTIVE');

      // 3. Unfreeze Alice's account back to ACTIVE
      const unfreezeRes = await request(app)
        .patch(`/api/admin/accounts/${aliceAccountId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ACTIVE', reason: 'Compliance verification completed' });

      expect(unfreezeRes.status).toBe(200);
      expect(unfreezeRes.body.account.status).toBe('ACTIVE');
    });

    it('PATCH /api/admin/accounts/:id/status should forbid ACCOUNT_HOLDER from altering status (HTTP 403)', async () => {
      const res = await request(app)
        .patch(`/api/admin/accounts/${aliceAccountId}/status`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ status: 'CLOSED' });

      expect(res.status).toBe(403);
    });
  });

  describe('2. Security Audit Logs', () => {
    it('GET /api/audit/logs should allow AUDITOR to review security logs', async () => {
      const res = await request(app)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.logs).toBeInstanceOf(Array);
      expect(res.body.totalLogs).toBeGreaterThan(0);
      expect(res.body.logs[0].action).toBeDefined();
      expect(res.body.logs[0].outcome).toBeDefined();
    });

    it('GET /api/audit/logs should allow ADMIN to review security logs', async () => {
      const res = await request(app)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.logs).toBeInstanceOf(Array);
    });

    it('GET /api/audit/logs should forbid ACCOUNT_HOLDER from accessing audit logs (HTTP 403)', async () => {
      const res = await request(app)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('3. Automated Mathematical Double-Entry Reconciliation Invariant', () => {
    it('GET /api/audit/reconciliation should verify debits equal credits and net system balance is zero', async () => {
      const res = await request(app)
        .get('/api/audit/reconciliation')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.auditStatus).toBe('VERIFIED_BALANCED');
      expect(res.body.moneyConservationHolds).toBe(true);
      expect(res.body.summary.discrepancyPaise).toBe(0);
      expect(res.body.systemBalanceBreakdown.netSumPaise).toBe(0);
      expect(res.body.unbalancedTransactionsCount).toBe(0);
    });

    it('GET /api/audit/reconciliation should forbid ACCOUNT_HOLDER (HTTP 403)', async () => {
      const res = await request(app)
        .get('/api/audit/reconciliation')
        .set('Authorization', `Bearer ${aliceToken}`);

      expect(res.status).toBe(403);
    });
  });
});
