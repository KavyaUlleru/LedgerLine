const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// All admin routes strictly require valid JWT and ADMIN role
router.use(authenticateToken);
router.use(requireRole('ADMIN'));

router.get('/users', adminController.listUsers);
router.patch('/accounts/:id/status', adminController.updateAccountStatus);

module.exports = router;
