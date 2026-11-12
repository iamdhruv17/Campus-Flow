const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Request = require('../models/Request');
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { sendSuccess, sendError } = require('../utils/apiResponse');

router.use(protect, authorize('admin'));

router.get('/stats', async (req, res, next) => {
  try {
    const [totalUsers, students, totalRequests, pendingRequests] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'student' }),
      Request.countDocuments(),
      Request.countDocuments({ status: { $in: ['pending', 'under_review'] } }),
    ]);

    sendSuccess(res, 200, 'Admin statistics retrieved.', {
      stats: {
        totalUsers,
        students,
        staff: totalUsers - students,
        totalRequests,
        pendingRequests,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));
    const filter = {};

    if (role) filter.role = role;
    if (search) {
      const escapedSearch = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
      ];
    }

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize),
    ]);
    sendSuccess(res, 200, 'Users retrieved.', {
      users,
      pagination: {
        total,
        page: pageNumber,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const {
      name, email, password, role, department, branch, year, section, rollNumber,
      assignedSubjects, assignedClass, mentoringClasses, headOfDepartments,
    } = req.body;
    const allowedRoles = ['teacher', 'coordinator', 'mentor', 'hod', 'dean', 'student'];
    if (!allowedRoles.includes(role)) {
      return sendError(res, 400, `Invalid role. Allowed: ${allowedRoles.join(', ')}.`);
    }

    const existing = await User.findOne({ email: String(email || '').toLowerCase() });
    if (existing) return sendError(res, 409, 'An account with this email already exists.');

    const user = await User.create({
      name,
      email,
      passwordHash: password,
      role,
      department: department || '',
      branch: branch || '',
      year: year ? Number(year) : undefined,
      section: section || '',
      rollNumber: rollNumber || '',
      assignedSubjects,
      assignedClass,
      mentoringClasses,
      headOfDepartments,
    });
    sendSuccess(res, 201, 'User account created.', { user: user.toPublicProfile() });
  } catch (error) {
    next(error);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash');
    if (!user) return sendError(res, 404, 'User not found.');
    sendSuccess(res, 200, 'User retrieved.', { user });
  } catch (error) {
    next(error);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const {
      name, email, role, department, branch, year, section, rollNumber,
      assignedSubjects, assignedClass, mentoringClasses, headOfDepartments, password,
    } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return sendError(res, 404, 'User not found.');
    const allowedRoles = ['teacher', 'coordinator', 'mentor', 'hod', 'dean', 'student'];
    if (role && !allowedRoles.includes(role) && !(role === 'admin' && user.role === 'admin')) {
      return sendError(res, 400, `Invalid role. Allowed: ${allowedRoles.join(', ')}.`);
    }

    if (email && email.toLowerCase() !== user.email) {
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) return sendError(res, 409, 'An account with this email already exists.');
    }

    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (role !== undefined) user.role = role;
    if (department !== undefined) user.department = department;
    if (branch !== undefined) user.branch = branch;
    if (year !== undefined) user.year = Number(year);
    if (section !== undefined) user.section = section;
    if (rollNumber !== undefined) user.rollNumber = rollNumber;
    if (assignedSubjects !== undefined) user.assignedSubjects = assignedSubjects;
    if (assignedClass !== undefined) user.assignedClass = assignedClass;
    if (mentoringClasses !== undefined) user.mentoringClasses = mentoringClasses;
    if (headOfDepartments !== undefined) user.headOfDepartments = headOfDepartments;
    if (password) user.passwordHash = password;

    await user.save();
    const updatedUser = await User.findById(user._id).select('-passwordHash');
    sendSuccess(res, 200, 'User updated.', { user: updatedUser });
  } catch (error) {
    next(error);
  }
});

router.patch('/users/:id/status', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return sendError(res, 404, 'User not found.');
    if (user.role === 'admin') {
      return sendError(res, 403, 'Cannot deactivate admin accounts through this endpoint.');
    }

    user.isActive = !user.isActive;
    await user.save();
    sendSuccess(res, 200, `User ${user.isActive ? 'activated' : 'deactivated'}.`, {
      user: user.toPublicProfile(),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
