const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// Public endpoints
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/reset-password', authController.resetPassword);

// Protected endpoints
router.get('/me', authenticateToken, authController.getMe);
router.put('/profile', authenticateToken, authController.updateProfile);

module.exports = router;


