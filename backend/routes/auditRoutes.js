const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// All audit routes strictly require valid JWT and either ADMIN or AUDITOR role
router.use(authenticateToken);
router.use(requireRole('ADMIN', 'AUDITOR'));

router.get('/logs', auditController.getAuditLogs);
router.get('/reconciliation', auditController.getReconciliation);

module.exports = router;
