const express = require('express');
const router = express.Router();
const {
  getUsers, getUserById, createUser, updateUser, toggleUserStatus,
  getMyProfile, updateMyProfile,
} = require('../controllers/user.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');

// Own profile (any authenticated user)
router.get('/profile', protect, getMyProfile);
router.put('/profile', protect, updateMyProfile);

// Admin-only routes
router.get('/', protect, authorize('admin'), getUsers);
router.post('/', protect, authorize('admin'), createUser);
router.get('/:id', protect, authorize('admin'), getUserById);
router.put('/:id', protect, authorize('admin'), updateUser);
router.patch('/:id/status', protect, authorize('admin'), toggleUserStatus);

module.exports = router;
