const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { authenticateToken } = require('../middleware/auth');

// All financial transaction routes require valid JWT authentication
router.use(authenticateToken);

router.post('/transfer', transactionController.transfer);
router.post('/deposit', transactionController.deposit);
router.post('/withdraw', transactionController.withdraw);

module.exports = router;

