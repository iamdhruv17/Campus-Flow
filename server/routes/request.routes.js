const express = require('express');
const router = express.Router();
const {
  createRequest, getRequests, getRequestById,
  approveRequest, rejectRequest, returnRequest, resubmitRequest,
  getRequestHistory, getMyStats,
} = require('../controllers/request.controller');
const { protect } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');

// Stats
router.get('/stats', protect, getMyStats);

// CRUD
router.post('/', protect, upload.array('files', 5), createRequest);
router.get('/', protect, getRequests);
router.get('/:id', protect, getRequestById);
router.get('/:id/history', protect, getRequestHistory);

// Workflow actions (staff only — enforced in controller by checking currentApproverId)
router.put('/:id/approve', protect, approveRequest);
router.put('/:id/reject', protect, rejectRequest);
router.put('/:id/return', protect, returnRequest);

// Student resubmit
router.put('/:id/resubmit', protect, upload.array('files', 5), resubmitRequest);

module.exports = router;
