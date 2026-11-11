const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query, getClient } = require('../db');
const { JWT_SECRET } = require('../middleware/auth');
const { logAuditEvent } = require('../utils/auditLogger');

/**
 * Controller: Register a new account holder
 * Security rule: Public registration strictly assigns role = 'ACCOUNT_HOLDER'.
 * Client cannot self-promote to ADMIN or AUDITOR.
 */
async function register(req, res, next) {
  const { name, email, password, phone } = req.body;

  // 1. Basic validation
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters long' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedPhone = phone && typeof phone === 'string' ? phone.trim() : null;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 2. Check if email already exists
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      await logAuditEvent({
        userId: null,
        action: 'REGISTER',
        outcome: 'DENIED',
        reason: `Registration rejected: Email ${normalizedEmail} already exists`,
      });
      return res.status(409).json({ error: 'An account with this email address already exists' });
    }

    // 3. Hash password with bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 4. Insert user with strictly enforced role = 'ACCOUNT_HOLDER'
    const userInsertSql = `
      INSERT INTO users (name, email, password_hash, role, phone)
      VALUES ($1, $2, $3, 'ACCOUNT_HOLDER', $4)
      RETURNING id, name, email, role, phone, created_at;
    `;
    const userRes = await client.query(userInsertSql, [name.trim(), normalizedEmail, passwordHash, trimmedPhone]);
    const newUser = userRes.rows[0];

    // 5. Automatically create initial customer bank account (STANDARD type, 0 balance)
    const accountNumber = `ACC-${Date.now().toString().slice(-6)}${newUser.id}`;
    const accountInsertSql = `
      INSERT INTO accounts (account_number, owner_user_id, balance, account_type, status)
      VALUES ($1, $2, 0, 'STANDARD', 'ACTIVE')
      RETURNING id, account_number, balance, account_type, status, created_at;
    `;
    const accountRes = await client.query(accountInsertSql, [accountNumber, newUser.id]);
    const newAccount = accountRes.rows[0];

    // 6. Log successful registration audit event
    await logAuditEvent(
      {
        userId: newUser.id,
        accountId: newAccount.id,
        action: 'REGISTER',
        outcome: 'SUCCESS',
        reason: `New account holder registered with account ${accountNumber}`,
      },
      client
    );

    await client.query('COMMIT');

    // 7. Issue signed JWT token
    const token = jwt.sign(
      {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      message: 'Account registered successfully',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        phone: newUser.phone,
        createdAt: newUser.created_at,
      },
      account: {
        id: newAccount.id,
        accountNumber: newAccount.account_number,
        balance: parseInt(newAccount.balance, 10),
        status: newAccount.status,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}


/**
 * Controller: Authenticate user & issue JWT
 */
async function login(req, res, next) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // 1. Find user by email
    const userResult = await query(
      'SELECT id, name, email, password_hash, role, phone, created_at FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      await logAuditEvent({
        userId: null,
        action: 'LOGIN',
        outcome: 'DENIED',
        reason: `Login failed: No user found with email ${normalizedEmail}`,
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    // 2. Verify password with bcrypt
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      await logAuditEvent({
        userId: user.id,
        action: 'LOGIN',
        outcome: 'DENIED',
        reason: 'Login failed: Incorrect password provided',
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // 3. Log successful login
    await logAuditEvent({
      userId: user.id,
      action: 'LOGIN',
      outcome: 'SUCCESS',
      reason: 'User authenticated successfully',
    });

    // 4. Retrieve user's associated accounts
    const accountsResult = await query(
      `SELECT id, account_number, balance, account_type, status, created_at 
       FROM accounts 
       WHERE owner_user_id = $1 
       ORDER BY id ASC`,
      [user.id]
    );

    // 5. Generate signed JWT token
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || null,
        createdAt: user.created_at,
      },
      accounts: accountsResult.rows.map((acc) => ({
        id: acc.id,
        accountNumber: acc.account_number,
        balance: parseInt(acc.balance, 10),
        accountType: acc.account_type,
        status: acc.status,
      })),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Get current authenticated user profile and owned accounts
 */
async function getMe(req, res, next) {
  try {
    const userId = req.user.id;

    const userRes = await query(
      'SELECT id, name, email, role, phone, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const accountsRes = await query(
      `SELECT id, account_number, balance, account_type, status, created_at 
       FROM accounts 
       WHERE owner_user_id = $1 
       ORDER BY id ASC`,
      [userId]
    );

    const user = userRes.rows[0];

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || null,
        createdAt: user.created_at,
      },
      accounts: accountsRes.rows.map((acc) => ({
        id: acc.id,
        accountNumber: acc.account_number,
        balance: parseInt(acc.balance, 10),
        accountType: acc.account_type,
        status: acc.status,
      })),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Update Profile Details (Name, Phone, Password)
 * Email and Role cannot be modified by user.
 * Available to ALL roles: ACCOUNT_HOLDER, ADMIN, AUDITOR
 */
async function updateProfile(req, res, next) {
  const userId = req.user.id;
  const { name, phone, password } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters long' });
  }

  if (password && (typeof password !== 'string' || password.length < 6)) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  try {
    let passwordHash = null;
    if (password && password.trim().length > 0) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    const trimmedPhone = phone && typeof phone === 'string' ? phone.trim() : null;

    const updateSql = passwordHash
      ? `UPDATE users 
         SET name = $1, phone = $2, password_hash = $3 
         WHERE id = $4 
         RETURNING id, name, email, role, phone, created_at;`
      : `UPDATE users 
         SET name = $1, phone = $2 
         WHERE id = $3 
         RETURNING id, name, email, role, phone, created_at;`;

    const params = passwordHash
      ? [name.trim(), trimmedPhone, passwordHash, userId]
      : [name.trim(), trimmedPhone, userId];

    const result = await query(updateSql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = result.rows[0];

    await logAuditEvent({
      userId: updatedUser.id,
      action: 'PROFILE_UPDATE',
      outcome: 'SUCCESS',
      reason: passwordHash ? 'Profile updated with new password and personal details' : 'Profile details updated',
    });

    return res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        phone: updatedUser.phone,
        createdAt: updatedUser.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Reset Password (Forgot Password flow)
 * Allows resetting password given email (and optional phone matching).
 */
async function resetPassword(req, res, next) {
  const { email, phone, newPassword } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Registered email address is required' });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const userRes = await query('SELECT id, name, email, phone FROM users WHERE email = $1', [normalizedEmail]);

    if (userRes.rows.length === 0) {
      await logAuditEvent({
        userId: null,
        action: 'PASSWORD_RESET',
        outcome: 'DENIED',
        reason: `Password reset rejected: No account found with email ${normalizedEmail}`,
      });
      return res.status(404).json({ error: 'No account found with this email address' });
    }

    const user = userRes.rows[0];

    // If user has a registered phone and provided phone, verify match
    if (phone && user.phone && user.phone.trim() !== phone.trim()) {
      await logAuditEvent({
        userId: user.id,
        action: 'PASSWORD_RESET',
        outcome: 'DENIED',
        reason: 'Password reset rejected: Provided phone number does not match registered phone',
      });
      return res.status(400).json({ error: 'Provided phone number does not match registered phone' });
    }

    const passwordHash = await bcrypt.hash(newPassword.trim(), 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);

    await logAuditEvent({
      userId: user.id,
      action: 'PASSWORD_RESET',
      outcome: 'SUCCESS',
      reason: 'Password reset completed successfully',
    });

    return res.status(200).json({
      message: 'Password reset successful. You can now sign in with your new password.',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  resetPassword,
};

