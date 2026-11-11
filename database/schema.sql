-- ============================================================================
-- LedgerLine Database Schema
-- Implements relational tables, check constraints, foreign keys, and immutability triggers.
-- All monetary amounts are stored in integer paise (₹1 = 100 paise) to prevent float errors.
-- ============================================================================

-- 1. Users Table
-- Roles: ADMIN, ACCOUNT_HOLDER, AUDITOR
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR')),
    phone VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ensure phone column exists on existing deployments
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);


-- 2. Accounts Table
-- Balances stored in paise (integer minor units).
-- account_type distinguishes:
--   - 'STANDARD': Normal customer accounts (balance >= 0)
--   - 'SYSTEM_RESERVE': Operating cash vault for system liquidity (balance >= 0)
--   - 'SYSTEM_EQUITY': Non-spendable capital offset (balance <= 0)
CREATE TABLE IF NOT EXISTS accounts (
    id BIGSERIAL PRIMARY KEY,
    account_number VARCHAR(32) UNIQUE NOT NULL,
    owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    balance BIGINT NOT NULL DEFAULT 0,
    account_type VARCHAR(20) NOT NULL DEFAULT 'STANDARD' CHECK (account_type IN ('STANDARD', 'SYSTEM_RESERVE', 'SYSTEM_EQUITY')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_account_balance CHECK (
        (account_type IN ('STANDARD', 'SYSTEM_RESERVE') AND balance >= 0)
        OR
        (account_type = 'SYSTEM_EQUITY' AND balance <= 0)
    )
);

-- 3. Transactions Table
-- High-level business record of requested financial movements.
-- Records both SUCCESS and REFUSED attempts (with refusal_reason).
-- Strict relationship constraints per transaction_type:
--   - TRANSFER: requires both source and destination (and they must be different)
--   - DEPOSIT: requires destination, source must be NULL
--   - WITHDRAWAL: requires source, destination must be NULL
CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER')),
    amount BIGINT NOT NULL CHECK (amount > 0),
    source_account_id BIGINT REFERENCES accounts(id) ON DELETE RESTRICT,
    destination_account_id BIGINT REFERENCES accounts(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'REFUSED')),
    refusal_reason TEXT,
    initiated_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_transaction_accounts CHECK (
        (transaction_type = 'TRANSFER' 
            AND source_account_id IS NOT NULL 
            AND destination_account_id IS NOT NULL 
            AND source_account_id <> destination_account_id)
        OR
        (transaction_type = 'DEPOSIT' 
            AND destination_account_id IS NOT NULL 
            AND source_account_id IS NULL)
        OR
        (transaction_type = 'WITHDRAWAL' 
            AND source_account_id IS NOT NULL 
            AND destination_account_id IS NULL)
    )
);

-- 4. Ledger Entries Table (Double-Entry Accounting Journal)
-- Strictly append-only. Every financial movement consists of matching DEBIT and CREDIT records.
-- DEBIT: Money leaves an account (balance decreases).
-- CREDIT: Money enters an account (balance increases).
CREATE TABLE IF NOT EXISTS ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    transaction_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
    account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    entry_type VARCHAR(10) NOT NULL CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    amount BIGINT NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Idempotency Keys Table
-- Scoped uniquely to the authenticated user to prevent replay attacks and duplicate execution.
-- Stores response_status and response_body so identical retries receive the exact cached result,
-- even for REFUSED transactions (e.g., INSUFFICIENT_FUNDS).
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(255) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_status INTEGER,
    response_body JSONB,
    transaction_id BIGINT REFERENCES transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_idempotency UNIQUE (user_id, idempotency_key)
);

-- 6. Audit Events Table
-- Operational log for security, administrative, and compliance audits.
-- Kept separate from financial ledger entries to prevent ledger pollution.
CREATE TABLE IF NOT EXISTS audit_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('SUCCESS', 'DENIED', 'FAILED')),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Non-Redundant Performance Indexes
CREATE INDEX IF NOT EXISTS idx_accounts_owner ON accounts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_initiated_by ON transactions(initiated_by);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_destination ON transactions(destination_account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_account ON audit_events(account_id);

-- 8. Immutability Trigger for Ledger Entries
-- Enforces the append-only invariant at the database engine level.
CREATE OR REPLACE FUNCTION prevent_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Ledger entries are strictly append-only: updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_ledger_immutable'
    ) THEN
        CREATE TRIGGER trigger_ledger_immutable
        BEFORE UPDATE OR DELETE ON ledger_entries
        FOR EACH ROW
        EXECUTE FUNCTION prevent_ledger_modification();
    END IF;
END $$;
