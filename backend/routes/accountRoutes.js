const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
const { authenticateToken } = require('../middleware/auth');

// All account routes require valid JWT authentication
router.use(authenticateToken);

router.get('/', accountController.getAccounts);
router.get('/:id', accountController.getAccountById);
router.get('/:id/statement', accountController.getAccountStatement);

module.exports = router;

