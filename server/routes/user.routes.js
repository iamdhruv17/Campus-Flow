const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth.middleware');
const { sendSuccess, sendError } = require('../utils/apiResponse');

router.get('/profile', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-passwordHash');
    sendSuccess(res, 200, 'Profile retrieved.', { user });
  } catch (error) {
    next(error);
  }
});

router.put('/profile', protect, async (req, res, next) => {
  try {
    const { name, branch, year, section, rollNumber, department } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return sendError(res, 404, 'User not found.');

    if (name !== undefined) user.name = name;
    if (branch !== undefined) user.branch = branch;
    if (year !== undefined) user.year = Number(year);
    if (section !== undefined) user.section = section;
    if (rollNumber !== undefined) user.rollNumber = rollNumber;
    if (department !== undefined) user.department = department;

    if (req.body.currentPassword || req.body.newPassword) {
      if (!req.body.currentPassword || !req.body.newPassword) {
        return sendError(res, 400, 'Current and new passwords are both required.');
      }

      const userWithPassword = await User.findById(req.user._id).select('+passwordHash');
      const isMatch = await userWithPassword.comparePassword(req.body.currentPassword);
      if (!isMatch) return sendError(res, 400, 'Current password is incorrect.');
      user.passwordHash = req.body.newPassword;
    }

    await user.save();
    const updatedUser = await User.findById(user._id).select('-passwordHash');
    sendSuccess(res, 200, 'Profile updated.', { user: updatedUser });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
