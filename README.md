# LedgerLine (BalanceVault)
### *Money Movement with a Ledger You Can Prove*

LedgerLine is a secure, auditable account management and money movement platform built with strict double-entry bookkeeping, deterministic concurrency controls, idempotency guarantees, role-based access control (RBAC), and centralized audit logging.

Built for the **SnovaSys Hiring Assessment** ("BalanceVault — money movement with a ledger you can prove"), this application provides a mathematically proven ledger where every rupee transferred is strictly balanced, fully auditable, and resilient against race conditions, duplicate requests, and administrative tampering.

---

## Key Features & Guarantees

1. **Strict Double-Entry Bookkeeping:**
   - Every financial operation records equal and opposite `DEBIT` and `CREDIT` entries in an append-only ledger (`ledger_entries`).
   - Symmetrical system reserve account (`SYS-RESERVE-001`) funds customer deposits and absorbs withdrawals, preserving total money conservation ($\sum \text{Debits} = \sum \text{Credits}$).
   - System equity account (`SYS-EQUITY-001`) offsets simulated opening capital, guaranteeing the net sum of all system balances is exactly zero.

2. **Concurrency Safety & Deadlock Elimination:**
   - All financial operations execute inside atomic PostgreSQL transactions (`BEGIN ... COMMIT`).
   - Deterministic ascending row-level locking (`SELECT ... FROM accounts WHERE id IN (...) ORDER BY id ASC FOR UPDATE`) prevents deadlocks during reciprocal concurrent transfers.
   - Non-negative balance constraints enforced at both the application level and the database schema level (`CHECK (balance >= 0)`).

3. **Client-Driven Idempotency:**
   - Requests carry client-generated UUIDs (`Idempotency-Key` header) hashed with SHA-256 over the request payload.
   - Exact duplicate requests return cached responses without re-executing transactions or modifying balances.

4. **Business Refusals Preserved Without Rollback:**
   - When an operation is refused (e.g., `INSUFFICIENT_FUNDS` or transfer to a `FROZEN` account), the system commits a `REFUSED` transaction record, logs a `DENIED` audit event, and saves the cached idempotency response—while writing **zero** ledger entries and making **no balance modifications**.

5. **Role-Based Access Control (RBAC):**
   - **`ACCOUNT_HOLDER`:** Manages own accounts, executes transfers, requests simulated deposits/withdrawals, views account statements.
   - **`ADMIN`:** Inspects all registered users, audits account statuses, freezes/unfreezes accounts to mitigate fraud. Direct balance tampering is strictly prohibited.
   - **`AUDITOR`:** Read-only access to centralized audit events and real-time mathematical double-entry reconciliation.

6. **Interactive Financial UI:**
   - Responsive 270px dark-slate sidebar with live API health indicator and role-gated navigation.
   - Top navbar with dynamic breadcrumbs, account balance dropdown, and a **1-Click Demo Evaluator Switcher** (Alice, Bob, Admin, Auditor) for zero-friction demonstration.
   - Real-time double-entry reconciliation dashboard verifying $\sum \text{Debits} == \sum \text{Credits}$ across all ledger entries.

---

## Technology Stack

- **Frontend:** React 19, Vite, Vanilla CSS (Modern CSS variables, no heavy external CSS frameworks)
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL (with `pg` connection pool; supports local PostgreSQL & cloud connection strings via `DATABASE_URL`)
- **Authentication & Security:** JWT (`jsonwebtoken`), `bcrypt` password hashing, SHA-256 idempotency hashing
- **Testing:** Jest, Supertest (33 automated integration & unit tests)
- **Language:** Plain JavaScript (ES6+), optimized for code clarity and interview review

---

## Project Structure

```
LedgerLine/
├── package.json               # Root convenience scripts for running & testing
├── render.yaml                # 1-Click / Blueprint cloud deployment configuration
├── THREATS.md                 # Formal threat model & security mitigation document
├── PROMPTS.md                 # 5+ dated AI interaction and architectural refinement logs
├── README.md                  # Complete project documentation
│
├── database/
│   ├── schema.sql             # Non-destructive DDL schema (6 tables, constraints, triggers)
│   └── seed.sql               # Seed data (Users, accounts, balanced double-entry funding)
│
├── backend/
│   ├── config/
│   ├── controllers/           # authController, accountController, transactionController,
│   │                          # adminController, auditController
│   ├── middleware/            # JWT auth, requireRole RBAC, idempotency verification
│   ├── routes/                # authRoutes, accountRoutes, transactionRoutes, adminRoutes, auditRoutes
│   ├── scripts/
│   │   └── init-db.js         # Safe database migration runner (supports local and DATABASE_URL)
│   ├── tests/                 # Jest & Supertest test suites (33 tests)
│   │   ├── auth.test.js       # User onboarding, login, RBAC enforcement
│   │   ├── ledger.test.js     # Transfers, concurrency, idempotency, refusals
│   │   └── admin_audit.test.js# User administration, account freeze, audit logs, reconciliation
│   ├── db.js                  # PostgreSQL pool configuration with SSL detection
│   ├── server.js              # Express app, health/readiness endpoints, error handling
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── Sidebar.jsx            # Dark-slate responsive navigation sidebar
    │   │   ├── Navbar.jsx             # Top bar with 1-click demo role switcher
    │   │   ├── AdminUsersView.jsx     # User oversight & Freeze/Unfreeze account toggles
    │   │   ├── AuditLogsView.jsx      # Filterable security audit trail
    │   │   └── ReconciliationView.jsx # Live double-entry mathematical reconciliation
    │   ├── pages/
    │   │   ├── AuthPage.jsx           # Tabbed Login & Registration form
    │   │   └── Dashboard.jsx          # Tabbed financial hub (Overview, Transfer, Statement)
    │   ├── services/
    │   │   └── api.js                 # Centralized API service with auth token injection
    │   ├── App.jsx                    # Root app state & role-gated routing
    │   ├── main.jsx
    │   └── index.css                  # Modern responsive design system
    ├── vercel.json                    # Single-page application routing config
    └── .env.example
```

---

## Demo Accounts & Test Credentials

The database is pre-seeded with 4 roles and initial balances:

| Role | Email | Password | Account Number | Initial Balance |
| :--- | :--- | :--- | :--- | :--- |
| **ACCOUNT_HOLDER** | `alice@example.com` | `Password@123` | `ACC-1001` | ₹500.00 (50,000 paise) |
| **ACCOUNT_HOLDER** | `bob@example.com` | `Password@123` | `ACC-1002` | ₹300.00 (30,000 paise) |
| **ADMIN** | `admin@example.com` | `Admin@123` | *System Admin* | N/A |
| **AUDITOR** | `auditor@example.com` | `Auditor@123` | *Compliance Officer* | N/A |

> **Pro-Tip for Evaluators:** In the web UI, you can switch between any of these 4 users instantaneously with a single click using the **Quick Switch Demo User** bar at the top of the screen!

---

## Getting Started Locally

### Prerequisites
- **Node.js:** v18+ (tested on v22)
- **PostgreSQL:** v14+ (local service running on port 5432)

### Step 1: Install Dependencies
From the repository root:
```bash
npm run install:all
```
*(Or run `npm install` inside both `backend/` and `frontend/`).*

### Step 2: Configure Environment Variables
Inside `backend/`, copy the sample environment file:
```bash
cd backend
cp .env.example .env
```
Ensure `DB_USER` and `DB_PASSWORD` match your local PostgreSQL configuration.

### Step 3: Initialize Database (Schema & Seed)
Run the automated initialization script from root:
```bash
npm run db:init
```
This safely creates the `ledgerline` database if needed, applies `database/schema.sql`, and seeds initial users and opening capital from `database/seed.sql`.

### Step 4: Run the Automated Test Suite
Run all 33 Jest & Supertest integration tests:
```bash
npm test
```
**Expected output:**
```
PASS tests/ledger.test.js
PASS tests/auth.test.js
PASS tests/admin_audit.test.js

Test Suites: 3 passed, 3 total
Tests:       33 passed, 33 total
```

### Step 5: Start the Backend & Frontend

**Terminal 1 (Backend API):**
```bash
npm run backend:dev
```
*API runs on `http://localhost:5000`.*
- Health check: `http://localhost:5000/api/health`
- Readiness check: `http://localhost:5000/api/ready`

**Terminal 2 (Frontend UI):**
```bash
npm run frontend:dev
```
*Frontend runs on `http://localhost:5173`.*

---

## Free Cloud Deployment (Render & Vercel)

The project is pre-configured for free cloud deployment without requiring a credit card.

### Deploying Backend on Render (Free)
1. Fork or push this repository to GitHub.
2. Sign in to [Render](https://render.com) (Free tier, no credit card required).
3. Click **New +** > **PostgreSQL**.
   - Name: `ledgerline-db`
   - Database: `ledgerline`
   - Plan: **Free**
4. Click **New +** > **Web Service**.
   - Connect your GitHub repository.
   - Root Directory: `backend`
   - Build Command: `npm install && npm run db:init`
   - Start Command: `npm start`
   - Add Environment Variable:
     - `DATABASE_URL`: *(Select from your Render PostgreSQL instance internal connection string)*
     - `JWT_SECRET`: *(Generate any random 32-character string)*
5. Render deploys your backend and provides a public URL: `https://ledgerline-backend.onrender.com`.

### Deploying Frontend on Vercel or Render Static Site (Free)
1. Sign in to [Vercel](https://vercel.com) or [Render](https://render.com).
2. Connect your repository:
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Add Environment Variable:
     - `VITE_API_BASE_URL`: `https://ledgerline-backend.onrender.com/api`
3. Click **Deploy**. Your interactive app is live for anyone to inspect!

---

## API Reference

### Public & Health Endpoints
- `GET /api/health` - Basic uptime and process check
- `GET /api/ready` - PostgreSQL database connectivity readiness check

### Authentication (`/api/auth`)
- `POST /api/auth/register` - Register a new account holder (strictly forces `ACCOUNT_HOLDER` role)
- `POST /api/auth/login` - Authenticate with email/password, issues JWT token
- `GET /api/auth/me` - Retrieve current user profile and accounts

### Financial Operations (`/api/accounts` & `/api/transactions`)
- `GET /api/accounts` - Retrieve all accounts owned by authenticated user
- `GET /api/accounts/:id/statement` - Retrieve paginated ledger entries with running balance
- `POST /api/transactions/transfer` - Atomic double-entry transfer between accounts (requires `Idempotency-Key` header)
- `POST /api/transactions/deposit` - Symmetrical cash deposit funded via `SYS-RESERVE-001`
- `POST /api/transactions/withdraw` - Symmetrical cash withdrawal absorbed by `SYS-RESERVE-001`

### Administration & Audit (`/api/admin` & `/api/audit`)
- `GET /api/admin/users` - Admin list of all users and account statuses
- `PATCH /api/admin/accounts/:id/status` - Admin freeze or unfreeze account
- `GET /api/audit/logs` - Admin & Auditor filterable audit trail
- `GET /api/audit/reconciliation` - Real-time double-entry mathematical reconciliation audit

---

## Mathematical Proof of Double-Entry Accounting

In LedgerLine, every financial movement satisfies:

$$\sum \text{Debits} = \sum \text{Credits}$$

And for the system as a whole across all accounts (Customer + System Equity + System Reserve):

$$\sum_{i=1}^{n} \text{Balance}_i = 0$$

- **Opening Capital:** Seeded with ₹10,00,000 credit to `SYS-RESERVE-001` balanced by a ₹10,00,000 debit offset to `SYS-EQUITY-001` (stored balance: `-100,000,000` paise).
- **Transfers:** Deducts from sender's balance (Debit to Customer) and increments receiver's balance (Credit to Customer). Total system balance change = 0.
- **Deposits:** Increments customer balance (Credit to Customer) and decrements system liquidity vault (Debit to `SYS-RESERVE-001`). Total system balance change = 0.
- **Withdrawals:** Decrements customer balance (Debit to Customer) and increments system reserve (Credit to `SYS-RESERVE-001`). Total system balance change = 0.

You can verify this live at any time via the **Reconciliation** tab in the UI or by calling `GET /api/audit/reconciliation`.

---

## License & Attribution

Developed by **Kavya Ulleru** for the **SnovaSys Technical Assessment**.
Distributed under the MIT License.
