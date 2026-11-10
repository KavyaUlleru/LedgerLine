const path = require('path');
const { Pool } = require('pg');

// Ensure .env is loaded from backend directory regardless of working directory
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();


// PostgreSQL connection pool configuration
// Supports cloud connection strings (DATABASE_URL) with SSL,
// and falls back to individual parameters for local development
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME || 'ledgerline',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    };

const pool = new Pool(poolConfig);

// Helper for single query execution
const query = (text, params) => pool.query(text, params);

// Helper to acquire a dedicated client from the pool (required for database transactions)
const getClient = () => pool.connect();

module.exports = {
  pool,
  query,
  getClient,
};


