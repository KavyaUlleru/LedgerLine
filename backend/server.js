const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const { authenticateToken, requireRole } = require('./middleware/auth');
const { query } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Standard Middleware
app.use(cors());
app.use(express.json());

// Public Health & Readiness Endpoints
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'LedgerLine API is operational',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/ready', async (req, res) => {
  try {
    await query('SELECT 1');
    res.status(200).json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unavailable',
      database: 'disconnected',
      error: error.message,
    });
  }
});

// Mounted API Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);

// Admin-Protected RBAC Verification Route
app.get('/api/admin/ping', authenticateToken, requireRole('ADMIN'), (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Admin authorization confirmed',
    caller: req.user,
  });
});

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start the server if file is run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LedgerLine backend server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
