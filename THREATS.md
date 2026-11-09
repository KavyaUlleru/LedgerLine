# LedgerLine Threat Model & Security Considerations

This document outlines the primary security risks, financial failure modes, and architectural mitigations identified for the LedgerLine financial transaction management system.

---

## 1. Concurrency and Race Conditions (Double-Spend)

### Threat Description
Simultaneous requests (e.g., rapid transfer requests from the same account across concurrent threads) could exploit the time window between balance verification and balance deduction, leading to overdrafts or duplicate spending.

### Mitigation Strategy
- Execute all financial state changes inside PostgreSQL atomic transactions (`BEGIN ... COMMIT`).
- Use row-level locking (`SELECT ... FOR UPDATE`) on account rows in a consistent ordering (e.g., ordered by account ID) to eliminate race conditions and avoid database deadlocks.
- Enforce check constraints in the database schema (`CHECK (balance >= 0)`) as a safeguard against application-level race conditions.

---

## 2. Duplicate Submissions and Replay Attacks

### Threat Description
Network retries, client double-clicks, or malicious replay attacks could submit identical transfer instructions multiple times, resulting in multiple charges.

### Mitigation Strategy
- Implement client-generated or request-level **Idempotency Keys** stored in a dedicated database table.
- Before executing a transaction, check if the idempotency key was previously processed. If so, return the stored result without re-executing money movement.
- Store the hash of the request payload alongside the idempotency key to reject modified requests reusing old keys.

---

## 3. Negative Balances and Numerical Precision Errors

### Threat Description
Floating-point arithmetic in JavaScript can introduce rounding errors (e.g., `0.1 + 0.2 = 0.30000000000000004`). In addition, insufficient server-side verification could allow negative amounts or sub-zero balances.

### Mitigation Strategy
- Store all monetary values as integers (representing the lowest currency unit, e.g., cents/paise) or PostgreSQL `NUMERIC`/`BIGINT` columns. Never use floating-point types (`FLOAT`/`REAL`) in the database or JavaScript float math for balance calculations.
- Validate on the backend that all deposit, withdrawal, and transfer amounts are strictly positive integers greater than zero (`amount > 0`).
- Apply database-level constraints `CHECK (balance >= 0)`.

---

## 4. Broken Object-Level Authorization (BOLA / IDOR)

### Threat Description
An authenticated user could attempt to read account balances or initiate transfers from an account belonging to another user by manipulating account IDs in request parameters.

### Mitigation Strategy
- Validate account ownership on the backend within transaction handlers. Never trust client-supplied user IDs or account claims without cross-referencing the authenticated JWT subject.
- Ensure SQL queries explicitly scope account access to the authenticated user ID (unless the caller possesses an AUDITOR or ADMIN role).

---

## 5. Role Confusion and Privilege Escalation

### Threat Description
Users might attempt to invoke administrative or auditor endpoints, or tamper with their assigned roles inside client storage.

### Mitigation Strategy
- Authenticate requests using digitally signed JWTs containing user claims (`sub`, `role`).
- Implement centralized role-based access control (RBAC) middleware verifying roles against explicit endpoint permission requirements (`ADMIN`, `ACCOUNT_HOLDER`, `AUDITOR`).
- Deny by default: endpoints require authentication unless explicitly declared public (e.g., login, health-check).

---

## 6. Ledger Tampering and Audit Record Loss

### Threat Description
Past financial records could be modified or deleted to cover illicit activity, or failed attempts could go unrecorded.

### Mitigation Strategy
- Employ an append-only transaction ledger (`entries` / `transactions`).
- Disallow `UPDATE` and `DELETE` operations on ledger tables through application architecture and database constraints.
- Record both successful transactions and refused attempts with timestamps, reasons, and initiator user IDs.

---

## 7. Frontend Validation Bypass

### Threat Description
Attackers can bypass frontend UI checks using direct API clients (such as cURL, Postman, or custom scripts).

### Mitigation Strategy
- Treat frontend input validation solely as user-experience feedback.
- Perform strict, defensive input validation and permission verification on the backend before any database operation is evaluated.

---

## 8. Direct Balance Mutation & Discrepancy Masking

### Threat Description
An administrative user or database administrator might attempt to manually adjust an account's balance to mask discrepancies or grant unbacked funds, violating the double-entry accounting invariant.

### Mitigation Strategy
- **No Manual Balance Endpoints:** The administrative API provides zero endpoints for modifying balances; administrators can only alter account operational status (e.g., `ACTIVE` vs `FROZEN`).
- **Database Trigger Enforcement:** PostgreSQL append-only triggers (`trigger_ledger_immutable`) block any `UPDATE` or `DELETE` statements on `ledger_entries`.
- **Automated Mathematical Reconciliation:** The system includes a dedicated reconciliation engine (`/api/audit/reconciliation`) that independently aggregates all debits and credits across the entire history of `ledger_entries` and compares them against each account's current cached balance. Any discrepancy immediately flags as `MISMATCH`.

---

## 9. Secret Exposure & Production Deployment Security

### Threat Description
Accidental leakage of database credentials, cloud connection strings, or JWT private signing keys in public GitHub repositories or client-side bundles.

### Mitigation Strategy
- Strict `.gitignore` prevents `.env` and sensitive local files from ever being committed to Git.
- Separation of backend environment secrets from frontend Vite public variables (frontend only consumes `VITE_API_BASE_URL`).
- Dynamic SSL certificate handling (`rejectUnauthorized: false` for managed cloud databases like Neon or Render) with encrypted transit over HTTPS and PostgreSQL TLS.


