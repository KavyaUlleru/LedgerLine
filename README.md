# LedgerLine

LedgerLine is a financial transaction management application built for an individual SnovaSys hiring assessment. The primary goal of the application is to process money transfers safely, prevent duplicate transactions and negative balances, and maintain an immutable, audit-ready transaction history.

## Technology Stack

- **Frontend:** React.js with Vite
- **Backend:** Node.js with Express.js
- **Database:** PostgreSQL (`pg` / node-postgres)
- **Authentication:** JWT (JSON Web Tokens) and bcrypt
- **Styling:** Vanilla CSS
- **Testing:** Jest and Supertest
- **Language:** JavaScript (ES6+)

## Project Structure

```
LedgerLine/
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── services/
│       ├── App.jsx
│       ├── main.jsx
│       └── index.css
│
├── backend/
│   ├── config/
│   ├── routes/
│   ├── controllers/
│   ├── middleware/
│   ├── db.js
│   └── server.js
│
├── database/
│   ├── schema.sql
│   └── seed.sql
│
├── THREATS.md
├── PROMPTS.md
├── README.md
└── .gitignore
```

## Getting Started

### Prerequisites

- Node.js (v18+ recommended; tested on v22)
- npm (v9+)
- PostgreSQL (v14+ recommended)

### 1. Backend Setup

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Configure your PostgreSQL connection parameters (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) and `JWT_SECRET`.
4. Start the backend development server:
   ```bash
   npm run dev
   ```
   The backend API will run at `http://localhost:5000`. A health check is available at `GET http://localhost:5000/api/health`.

### 2. Database Initialization (Optional / Controlled)

To apply the schema and seed data to your local PostgreSQL instance:
```bash
cd backend
npm run db:init
```
*(Uses `.env` parameters to connect safely without dropping existing tables).*

### 3. Frontend Setup

1. Navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The frontend application will be accessible at `http://localhost:5173`.

## Core System Requirements (Roadmap)

1. **Role-Based Authentication:** ADMIN, ACCOUNT_HOLDER, and AUDITOR roles.
2. **Account Management:** Creation, balance viewing, and statement generation.
3. **Core Financial Operations:** Deposits, withdrawals, and account transfers.
4. **Double-Entry Bookkeeping:** Money conservation with debit/credit balance consistency.
5. **Negative Balance Prevention:** Server-side checks guaranteeing accounts never drop below zero.
6. **Idempotency:** Unique idempotency keys to eliminate duplicate money movements.
7. **Concurrency Safety:** PostgreSQL transactions and explicit row-level locking (`FOR UPDATE`).
8. **Audit Trail:** Append-only transaction records including running balance and initiator identification.
9. **Account Authorization:** Server-enforced permissions on account access.
10. **Automated Testing:** Comprehensive Jest/Supertest suite verifying financial guarantees.

## Current Project Status

- **Stage 1 Complete:** Project structure initialized, frontend Vite shell created, backend Express server initialized with PostgreSQL pool configuration and health-check endpoint.
- **Next Stage:** Database schema definition and role-based authentication implementation.

