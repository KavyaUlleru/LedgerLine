// API Service for LedgerLine Frontend
const API_BASE = 'http://localhost:5000/api';

/**
 * Generate a client-side UUID for idempotency keys
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'idemp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Helper to get the stored JWT token
 */
export function getToken() {
  return localStorage.getItem('ledgerline_token');
}

/**
 * Helper to store JWT token and user info
 */
export function setAuthSession(token, user) {
  localStorage.setItem('ledgerline_token', token);
  localStorage.setItem('ledgerline_user', JSON.stringify(user));
}

/**
 * Helper to clear auth session on logout
 */
export function clearAuthSession() {
  localStorage.removeItem('ledgerline_token');
  localStorage.removeItem('ledgerline_user');
}

/**
 * Helper to retrieve stored user
 */
export function getStoredUser() {
  const user = localStorage.getItem('ledgerline_user');
  try {
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

/**
 * Base fetch wrapper with error handling and Authorization header injection
 */
async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.error || data.message || `Request failed with status ${response.status}`;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// ----------------------------------------------------------------------------
// Auth Endpoints
// ----------------------------------------------------------------------------

export async function loginUser(email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function registerUser(name, email, password) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
}

export async function fetchCurrentUser() {
  return request('/auth/me', {
    method: 'GET',
  });
}

export async function checkHealth() {
  return request('/health', {
    method: 'GET',
  });
}

// ----------------------------------------------------------------------------
// Financial & Account Endpoints (Task 2)
// ----------------------------------------------------------------------------

export async function fetchAccounts() {
  return request('/accounts', {
    method: 'GET',
  });
}

export async function fetchAccountStatement(accountId) {
  return request(`/accounts/${accountId}/statement`, {
    method: 'GET',
  });
}

export async function executeTransfer({ sourceAccountId, destinationAccountNumber, amountPaise, idempotencyKey }) {
  return request('/transactions/transfer', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    body: JSON.stringify({
      sourceAccountId,
      destinationAccountNumber,
      amount: amountPaise,
    }),
  });
}

export async function executeDeposit({ accountId, amountPaise, idempotencyKey }) {
  return request('/transactions/deposit', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    body: JSON.stringify({
      accountId,
      amount: amountPaise,
    }),
  });
}

export async function executeWithdraw({ accountId, amountPaise, idempotencyKey }) {
  return request('/transactions/withdraw', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    body: JSON.stringify({
      accountId,
      amount: amountPaise,
    }),
  });
}
