const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL connection pool configuration
// Uses environment variables with sensible defaults for local development
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'ledgerline',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Helper for single query execution
const query = (text, params) => pool.query(text, params);

// Helper to acquire a dedicated client from the pool (required for database transactions)
const getClient = () => pool.connect();

module.exports = {
  pool,
  query,
  getClient,
};

