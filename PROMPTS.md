# LedgerLine - Development & Prompt Log

This document records the prompt progression, objectives, implementation steps, and architectural decisions made throughout the development of LedgerLine.

---

## Stage 1: Project Initialization and Setup

### Objective
Initialize the project structure, establish the React (Vite) frontend and Node.js (Express) backend environments, set up database placeholder files, and create foundational security and project documentation.

### User Request Summary
- Target stack: React.js (Vite), Node.js (Express), PostgreSQL (`pg`), JWT, bcrypt, CSS, Jest, Supertest.
- JavaScript only (no TypeScript), simple and understandable for interview explanation.
- Set up directory structure: `frontend/`, `backend/`, `database/`, `THREATS.md`, `PROMPTS.md`, `README.md`, `.gitignore`.
- First task scope: Only initialize project structure and basic frontend/backend shells; no authentication or financial transaction logic yet.

### Actions Taken
1. Initialized Git repository.
2. Scaffolded React frontend using Vite with JavaScript template.
   - Cleaned template boilerplate.
   - Configured `frontend/src/` with `components/`, `pages/`, `services/`, `App.jsx`, `main.jsx`, and `index.css`.
   - Verified frontend production build.
3. Created backend environment:
   - Configured `backend/package.json` with scripts for `start`, `dev`, and `test`.
   - Installed core dependencies: `express`, `pg`, `dotenv`, `cors`, `jsonwebtoken`, `bcrypt`.
   - Installed testing and development dependencies: `jest`, `supertest`, `nodemon`.
   - Structured backend folders: `config/`, `routes/`, `controllers/`, `middleware/`.
   - Implemented `backend/db.js` with PostgreSQL connection pool configuration and transaction client helper.
   - Implemented `backend/server.js` with Express middleware, a health-check endpoint (`/api/health`), 404 handler, error handling, and test-friendly export.
   - Added `backend/.env.example`.
4. Initialized `database/schema.sql` and `database/seed.sql` placeholders.
5. Created root `.gitignore`.
6. Created initial versions of `README.md`, `THREATS.md`, and `PROMPTS.md`.

### Status
Completed Stage 1. Waiting for user review before proceeding to Stage 2.



---

## Stage 2: Database Schema & Seed Data Design

### Objective
Design and generate the PostgreSQL database schema (`database/schema.sql`) and initial seed data (`database/seed.sql`) incorporating strict double-entry bookkeeping, simulated opening equity, idempotency tracking, append-only triggers, and zero-drop non-destructive schema generation.

### User Request Summary
- Design six core tables: `users`, `accounts`, `transactions`, `ledger_entries`, `idempotency_keys`, `audit_events`.
- Store currency in integer minor units (paise) to prevent float errors.
- Ensure strict transactional constraints: TRANSFER requires both accounts (different), DEPOSIT requires destination (source NULL), WITHDRAWAL requires source (destination NULL).
- Enforce strict balance constraints: `STANDARD` and `SYSTEM_RESERVE` must have `balance >= 0`; `SYSTEM_EQUITY` must have `balance <= 0`.
- Protect the ledger with an append-only PostgreSQL trigger.
- Maintain pure double-entry symmetry across all transactions (including opening capital).
- Remove all DROP statements from `schema.sql` to protect existing data.
- Do not execute SQL commands directly against the database; provide instructions for safe execution.

### Actions Taken
1. Authored `database/schema.sql`:
   - Defined `users` table with roles (`ADMIN`, `ACCOUNT_HOLDER`, `AUDITOR`).
   - Defined `accounts` table with `chk_account_balance` enforcing `(account_type IN ('STANDARD', 'SYSTEM_RESERVE') AND balance >= 0) OR (account_type = 'SYSTEM_EQUITY' AND balance <= 0)`.
   - Defined `transactions` table with strict `chk_transaction_accounts` constraint.
   - Defined `ledger_entries` table with append-only database trigger `trigger_ledger_immutable`.
   - Defined `idempotency_keys` table with scoped unique constraint `uq_user_idempotency` and cached responses for retries.
   - Defined `audit_events` table for operational and security audit trails.
   - Added non-redundant performance indexes.
   - Used `CREATE TABLE IF NOT EXISTS` without any destructive `DROP` statements.
2. Authored `database/seed.sql`:
   - Seeded 4 users (Admin, Auditor, Alice, Bob) with bcrypt password hashes.
   - Seeded 4 accounts: `SYS-EQUITY-001` (-100,000,000 paise), `SYS-RESERVE-001` (99,920,000 paise), `ACC-1001` (50,000 paise), `ACC-1002` (30,000 paise).
   - Seeded 3 balanced double-entry transactions (simulated opening capital, Alice funding, Bob funding) where sum of debits = sum of credits = 100,080,000 paise and sum of all balances = 0.
   - Seeded audit events and sequence synchronization using safe `ON CONFLICT DO NOTHING`.
3. Created safe runner script `backend/scripts/init-db.js` and added `"db:init"` script in `backend/package.json`.

### Status
Stage 2 Complete. SQL files generated safely without executing against the user's database. Ready for user review.


---

## Stage 3: Core Authentication & Role-Based Access Control (Task 1)

### Date
2026-11-09

### What I Asked For
Implement the user onboarding and authentication system for LedgerLine, including registration (`/api/auth/register`), login (`/api/auth/login`), profile retrieval (`/api/auth/me`), JWT issuance, password hashing with bcrypt, role-based access control (`requireRole`), and automated tests.

### What the AI Produced
The AI initially generated a registration handler that accepted the `role` field directly from `req.body` and inserted it into the `users` table without server-side validation. Furthermore, it only logged successful actions and threw unhandled errors on bad passwords instead of writing security events to `audit_events`.

### What Was Wrong With It (Authorisation / Access Control Deficit)
1. **Privilege Escalation Vulnerability:** Any public user could send `{"role": "ADMIN"}` or `{"role": "AUDITOR"}` in the registration payload and instantly grant themselves administrative or auditing privileges over the financial system.
2. **Audit Trail Blindspot:** Failed login attempts (such as brute-force password guessing or querying non-existent accounts) were not recorded in `audit_events`, violating the core requirement for an auditable security trail.

### What I Did Instead
1. **Enforced Principle of Least Privilege:** Modified `register` in `authController.js` to strictly enforce `role = 'ACCOUNT_HOLDER'` in the SQL insert, unconditionally ignoring any user-supplied role in `req.body`.
2. **Defensive Role-Based Access Control:** Built `requireRole(...allowedRoles)` middleware in `middleware/auth.js` that verifies role claims extracted from cryptographically signed JWTs and denies access with HTTP 403 Forbidden.
3. **Comprehensive Security Auditing:** Created `utils/auditLogger.js` to record both `SUCCESS` and `DENIED` outcomes in `audit_events` with detailed failure reasons (`INVALID_PASSWORD`, `USER_NOT_FOUND`, `EMAIL_ALREADY_EXISTS`).
4. **Automated Verification:** Added dedicated test suites in `tests/auth.test.js` to explicitly test that attempting to pass `role: 'ADMIN'` during registration still results in `ACCOUNT_HOLDER`, and that protected routes reject unauthorized roles.

### Commit
`feat(auth): implement user registration, JWT authentication and role-based access control`


---

## Stage 4: Core Financial Ledger Engine, Concurrency & Idempotency (Task 2)

### Date
2026-11-09

### What I Asked For
Implement the core money movement engine for LedgerLine: account-to-account transfers, deposits, withdrawals, statement generation with running balances, double-entry ledgering (`ledger_entries`), row-level concurrency locking (`SELECT ... FOR UPDATE`), server-side negative balance prevention, idempotency caching, and an improved interactive frontend UI.

### What the AI Produced
The AI initially implemented transfer endpoints with straightforward `SELECT balance FROM accounts` checks and separate `UPDATE` queries without pessimistic row locking. It also locked accounts in whatever order they were supplied in the payload, and threw a runtime error on insufficient funds that rolled back the entire transaction.

### What Was Wrong With It (Integrity, Concurrency & Audit Deficit)
1. **Concurrency Race Condition & Double-Spend:** Without pessimistic row-level locking (`FOR UPDATE`), two concurrent requests could simultaneously read the same balance and execute separate deductions, driving the account balance negative and violating money conservation.
2. **Deadlock Hazard:** If User 1 transferred from Account 2 to Account 5 while User 2 simultaneously transferred from Account 5 to Account 2, unordered row locks caused a circular wait (**deadlock**), aborting transactions unreliably.
3. **Loss of Refusal Audit Trail:** When an account lacked sufficient funds, rolling back the database transaction also erased the transaction log and audit event, leaving zero record of the unauthorized or failed attempt.
4. **Idempotency Fragility:** Identical retries failed if the key was only recorded on success, risking duplicate execution if a client retried a pending or refused operation.

### What I Did Instead
1. **Deterministic Ascending Row Locking:** Enforced deterministic lock ordering across all money movements (`ORDER BY id ASC FOR UPDATE`), ensuring that reciprocal concurrent transfers acquire locks in a globally consistent sequence.
2. **Graceful Refusal Recording:** Separated business validation failures from database errors. When an operation is refused (e.g. `INSUFFICIENT_FUNDS`), the backend commits a record in `transactions` (`status = 'REFUSED'`), writes a `DENIED` audit log to `audit_events`, and caches the refusal response in `idempotency_keys`—while strictly creating **zero** ledger entries and making **no balance modifications**.
3. **Complete Double-Entry Conservation:** Ensured every successful operation creates matching `DEBIT` and `CREDIT` entries in `ledger_entries`, routed through `SYSTEM_RESERVE` for deposits and withdrawals, preserving $\sum \text{Debits} = \sum \text{Credits}$.
4. **Interactive Financial UI:** Created tabbed navigation in the React frontend with an interactive transfer form, live INR-to-paise conversion previews, client UUID idempotency key regeneration, and a live statement viewer with running balance calculations.
5. **Comprehensive Verification:** Wrote automated tests in `tests/ledger.test.js` validating money conservation, negative balance rejections, duplicate request deduplication, and IDOR prevention.

### Commit
`feat(ledger): implement double-entry transfer engine, row locking, idempotency and interactive UI`
