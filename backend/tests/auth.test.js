const request = require('supertest');
const app = require('../server');
const { pool } = require('../db');

describe('Task 1: Authentication & Role-Based Access Control (RBAC)', () => {
  const testEmail = `testuser_${Date.now()}@ledgerline.local`;
  const testPassword = 'Password123!';
  let accountHolderToken = '';
  let adminToken = '';

  afterAll(async () => {
    // Close the DB connection pool cleanly after tests finish
    await pool.end();
  });

  describe('1. Health & Readiness Endpoints', () => {
    it('GET /api/health should return 200 OK', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /api/ready should check database readiness', async () => {
      const res = await request(app).get('/api/ready');
      expect([200, 503]).toContain(res.status);
    });
  });

  describe('2. User Registration & Onboarding', () => {
    it('should reject registration with invalid email or short password', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Invalid User',
        email: 'invalid-email',
        password: '123',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should successfully register an ACCOUNT_HOLDER and create an initial account', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Test Account Holder',
        email: testEmail,
        password: testPassword,
      });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.role).toBe('ACCOUNT_HOLDER');
      expect(res.body.account).toBeDefined();
      expect(res.body.account.balance).toBe(0);
      expect(res.body.account.status).toBe('ACTIVE');

      accountHolderToken = res.body.token;
    });

    it('should reject duplicate registration with HTTP 409 Conflict', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Duplicate User',
        email: testEmail,
        password: testPassword,
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already exists/i);
    });

    it('should prevent privilege escalation: client supplying role="ADMIN" must still get role="ACCOUNT_HOLDER"', async () => {
      const attackerEmail = `attacker_${Date.now()}@ledgerline.local`;
      const res = await request(app).post('/api/auth/register').send({
        name: 'Privilege Attacker',
        email: attackerEmail,
        password: testPassword,
        role: 'ADMIN', // Malicious attempt to escalate
      });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('ACCOUNT_HOLDER'); // Must remain ACCOUNT_HOLDER
    });
  });

  describe('3. User Authentication (Login)', () => {
    it('should reject login with wrong password (HTTP 401)', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: testEmail,
        password: 'WrongPassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid email or password/i);
    });

    it('should reject login for non-existent user (HTTP 401)', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'does_not_exist@ledgerline.local',
        password: 'AnyPassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid email or password/i);
    });

    it('should successfully log in registered user with correct password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: testEmail,
        password: testPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.accounts).toBeInstanceOf(Array);
      expect(res.body.accounts.length).toBeGreaterThan(0);
    });

    it('should successfully authenticate seeded ADMIN user (admin@ledgerline.local)', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'admin@ledgerline.local',
        password: 'Admin123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('ADMIN');
      expect(res.body.token).toBeDefined();

      adminToken = res.body.token;
    });
  });

  describe('4. Protected Routes & RBAC Authorization', () => {
    it('GET /api/auth/me should reject requests without token (HTTP 401)', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('GET /api/auth/me should reject requests with invalid/tampered token (HTTP 403)', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid_tampered_token_string');
      expect(res.status).toBe(403);
    });

    it('GET /api/auth/me should return user and account profile for valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accountHolderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.accounts).toBeInstanceOf(Array);
    });

    it('GET /api/admin/ping should allow ADMIN role caller', async () => {
      const res = await request(app)
        .get('/api/admin/ping')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/admin authorization confirmed/i);
    });

    it('GET /api/admin/ping should forbid ACCOUNT_HOLDER role caller (HTTP 403)', async () => {
      const res = await request(app)
        .get('/api/admin/ping')
        .set('Authorization', `Bearer ${accountHolderToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/forbidden/i);
    });
  });
});

