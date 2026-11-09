-- ============================================================================
-- LedgerLine Database Seed Data
-- Provides baseline users for all 3 roles (ADMIN, AUDITOR, ACCOUNT_HOLDER),
-- initial system accounts (SYSTEM_EQUITY, SYSTEM_RESERVE), active customer accounts,
-- and fully balanced double-entry ledger records.
-- ============================================================================

-- All seed passwords follow the pattern: <Name>123!
--   admin@ledgerline.local   -> Admin123!
--   auditor@ledgerline.local -> Auditor123!
--   alice@ledgerline.local   -> Alice123!
--   bob@ledgerline.local     -> Bob123!

-- ----------------------------------------------------------------------------
-- 1. Seed Users
-- ----------------------------------------------------------------------------
INSERT INTO users (id, name, email, password_hash, role) VALUES
(1, 'System Administrator', 'admin@ledgerline.local', '$2b$10$HFALe5sglujCfPc2iWXEjOSIgrxSJu8fMYAyvhK6UU5vdefKBV0Uq', 'ADMIN'),
(2, 'Lead Auditor', 'auditor@ledgerline.local', '$2b$10$ndVgWpA3cVpoTAp/650HuOR28VlQf.IvkUg48FMwtzH2DuqwH7nim', 'AUDITOR'),
(3, 'Alice Sharma', 'alice@ledgerline.local', '$2b$10$mEpuVS9kkgHMLOvb42AY3OKdIQtb55yHbvWvRP2VT0F0za.rrFGuW', 'ACCOUNT_HOLDER'),
(4, 'Bob Verma', 'bob@ledgerline.local', '$2b$10$jahMIfDbBCq3VHZFwlCjJ.g0oLd.T8D/5RzkprC4OIFpRCX4AemU2', 'ACCOUNT_HOLDER')
ON CONFLICT (id) DO NOTHING;

SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users));

-- ----------------------------------------------------------------------------
-- 2. Seed Accounts
-- Balances stored in integer paise:
--   Account 1: SYS-EQUITY-001  -> Non-spendable capital offset (-100,000,000 paise = -₹10,00,000)
--   Account 2: SYS-RESERVE-001 -> Spendable system liquidity vault (99,920,000 paise = ₹9,99,200)
--   Account 3: ACC-1001 (Alice)-> Active customer account (50,000 paise = ₹500)
--   Account 4: ACC-1002 (Bob)  -> Active customer account (30,000 paise = ₹300)
-- Total system balances sum to exactly 0 (absolute money conservation).
-- ----------------------------------------------------------------------------
INSERT INTO accounts (id, account_number, owner_user_id, balance, account_type, status) VALUES
(1, 'SYS-EQUITY-001', 1, -100000000, 'SYSTEM_EQUITY', 'ACTIVE'),
(2, 'SYS-RESERVE-001', 1, 99920000, 'SYSTEM_RESERVE', 'ACTIVE'),
(3, 'ACC-1001', 3, 50000, 'STANDARD', 'ACTIVE'),
(4, 'ACC-1002', 4, 30000, 'STANDARD', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

SELECT setval('accounts_id_seq', (SELECT COALESCE(MAX(id), 1) FROM accounts));

-- ----------------------------------------------------------------------------
-- 3. Initial Transactions
-- Transaction 1: Initial Simulated Capital Injection of ₹10,00,000 (100,000,000 paise)
-- Transaction 2: Initial Account Funding for Alice (50,000 paise = ₹500)
-- Transaction 3: Initial Account Funding for Bob (30,000 paise = ₹300)
-- ----------------------------------------------------------------------------
INSERT INTO transactions (id, transaction_type, amount, source_account_id, destination_account_id, status, initiated_by) VALUES
(1, 'DEPOSIT', 100000000, NULL, 2, 'SUCCESS', 1),
(2, 'DEPOSIT', 50000, NULL, 3, 'SUCCESS', 1),
(3, 'DEPOSIT', 30000, NULL, 4, 'SUCCESS', 1)
ON CONFLICT (id) DO NOTHING;

SELECT setval('transactions_id_seq', (SELECT COALESCE(MAX(id), 1) FROM transactions));

-- ----------------------------------------------------------------------------
-- 4. Double-Entry Ledger Records
-- Every transaction is split into balanced DEBIT and CREDIT records:
-- Tx 1: DEBIT Equity (-100,000,000) -> CREDIT Reserve (+100,000,000)
-- Tx 2: DEBIT Reserve (-50,000)      -> CREDIT Alice (+50,000)
-- Tx 3: DEBIT Reserve (-30,000)      -> CREDIT Bob (+30,000)
-- Total Debits = 100,080,000 paise = Total Credits = 100,080,000 paise.
-- ----------------------------------------------------------------------------
INSERT INTO ledger_entries (id, transaction_id, account_id, entry_type, amount) VALUES
(1, 1, 1, 'DEBIT', 100000000),
(2, 1, 2, 'CREDIT', 100000000),
(3, 2, 2, 'DEBIT', 50000),
(4, 2, 3, 'CREDIT', 50000),
(5, 3, 2, 'DEBIT', 30000),
(6, 3, 4, 'CREDIT', 30000)
ON CONFLICT (id) DO NOTHING;

SELECT setval('ledger_entries_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ledger_entries));

-- ----------------------------------------------------------------------------
-- 5. Seed Audit Events
-- ----------------------------------------------------------------------------
INSERT INTO audit_events (user_id, account_id, action, outcome, reason) VALUES
(1, NULL, 'SYSTEM_INIT', 'SUCCESS', 'Database schema initialized and baseline system roles seeded.'),
(1, 2, 'CAPITAL_INJECTION', 'SUCCESS', 'Initial simulated operating capital of 100,000,000 paise credited to SYS-RESERVE-001.'),
(1, 3, 'INITIAL_FUNDING', 'SUCCESS', 'Opening balance of 50,000 paise credited to Alice Sharma (ACC-1001).'),
(1, 4, 'INITIAL_FUNDING', 'SUCCESS', 'Opening balance of 30,000 paise credited to Bob Verma (ACC-1002).');

SELECT setval('audit_events_id_seq', (SELECT COALESCE(MAX(id), 1) FROM audit_events));
