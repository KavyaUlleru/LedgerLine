const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT, 10) || 5432;
const dbName = process.env.DB_NAME || 'ledgerline';
const dbUser = process.env.DB_USER || 'postgres';
const dbPassword = process.env.DB_PASSWORD || 'postgres';

async function ensureDatabaseExists() {
  if (process.env.DATABASE_URL) {
    // In cloud databases (Neon, Render, Supabase), the database is provisioned automatically
    return;
  }

  // Connect to default 'postgres' database to check/create the target database
  const maintenancePool = new Pool({
    host: dbHost,
    port: dbPort,
    database: 'postgres',
    user: dbUser,
    password: dbPassword,
  });

  try {
    const res = await maintenancePool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );
    if (res.rowCount === 0) {
      console.log(`Database "${dbName}" does not exist. Creating it now...`);
      await maintenancePool.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database "${dbName}" created successfully.`);
    } else {
      console.log(`Database "${dbName}" already exists.`);
    }
  } catch (err) {
    console.warn(`Note: Could not check/create database via maintenance pool: ${err.message}`);
  } finally {
    await maintenancePool.end();
  }
}

async function initializeDatabase() {
  await ensureDatabaseExists();

  const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost')
          ? false
          : { rejectUnauthorized: false },
      }
    : {
        host: dbHost,
        port: dbPort,
        database: dbName,
        user: dbUser,
        password: dbPassword,
      };

  const targetPool = new Pool(poolConfig);

  const schemaPath = path.join(__dirname, '../../database/schema.sql');
  const seedPath = path.join(__dirname, '../../database/seed.sql');

  console.log(`Connecting to "${dbName}" on ${dbHost}:${dbPort}...`);
  const client = await targetPool.connect();

  try {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    const seedSql = fs.readFileSync(seedPath, 'utf8');

    console.log('Applying database schema (schema.sql)...');
    await client.query(schemaSql);
    console.log('Schema applied successfully.');

    console.log('Applying seed data (seed.sql)...');
    await client.query(seedSql);
    console.log('Seed data inserted successfully.');

    // Verification check
    const usersCount = await client.query('SELECT COUNT(*) FROM users');
    const accountsCount = await client.query('SELECT COUNT(*) FROM accounts');
    const entriesCount = await client.query('SELECT COUNT(*) FROM ledger_entries');
    const conservationCheck = await client.query(
      `SELECT 
         SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) AS total_debits,
         SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) AS total_credits
       FROM ledger_entries`
    );

    console.log('\n--- Database Initialization Verification ---');
    console.log(`Users seeded:          ${usersCount.rows[0].count}`);
    console.log(`Accounts seeded:       ${accountsCount.rows[0].count}`);
    console.log(`Ledger entries seeded: ${entriesCount.rows[0].count}`);
    console.log(`Total Debits:          ₹${(parseInt(conservationCheck.rows[0].total_debits, 10) / 100).toFixed(2)} (${conservationCheck.rows[0].total_debits} paise)`);
    console.log(`Total Credits:         ₹${(parseInt(conservationCheck.rows[0].total_credits, 10) / 100).toFixed(2)} (${conservationCheck.rows[0].total_credits} paise)`);
    console.log('Money Conservation:    ' + 
      (conservationCheck.rows[0].total_debits === conservationCheck.rows[0].total_credits ? 'VERIFIED (Balanced)' : 'FAILED (Unbalanced)'));
    console.log('--------------------------------------------\n');

  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await targetPool.end();
  }
}

if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase };
