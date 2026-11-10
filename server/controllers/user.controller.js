const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// GET /api/users — admin only
const getUsers = async (req, res, next) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    sendSuccess(res, 200, 'Users retrieved.', {
      users,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/users/:id — admin only
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash');
    if (!user) return sendError(res, 404, 'User not found.');
    sendSuccess(res, 200, 'User retrieved.', { user });
  } catch (error) {
    next(error);
  }
};

// POST /api/users — admin only, create staff account
const createUser = async (req, res, next) => {
  try {
    const {
      name, email, password, role, department, branch, year, section, rollNumber,
      assignedSubjects, assignedClass, mentoringClasses, headOfDepartments,
    } = req.body;

    // Admin can create any role EXCEPT admin (to prevent privilege escalation)
    const allowedRoles = ['teacher', 'coordinator', 'mentor', 'hod', 'dean', 'student'];
    if (!allowedRoles.includes(role)) {
      return sendError(res, 400, `Invalid role. Allowed: ${allowedRoles.join(', ')}.`);
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return sendError(res, 409, 'An account with this email already exists.');

    const userData = {
      name, email, passwordHash: password, role,
      department: department || '',
      branch: branch || '',
      section: section || '',
      rollNumber: rollNumber || '',
    };
    if (year) userData.year = Number(year);
    if (assignedSubjects) userData.assignedSubjects = assignedSubjects;
    if (assignedClass) userData.assignedClass = assignedClass;
    if (mentoringClasses) userData.mentoringClasses = mentoringClasses;
    if (headOfDepartments) userData.headOfDepartments = headOfDepartments;

    const user = await User.create(userData);
    sendSuccess(res, 201, 'User account created.', { user: user.toPublicProfile() });
  } catch (error) {
    next(error);
  }
};

// PUT /api/users/:id — admin only
const updateUser = async (req, res, next) => {
  try {
    const {
      name, email, role, department, branch, year, section, rollNumber,
      assignedSubjects, assignedClass, mentoringClasses, headOfDepartments,
    } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) return sendError(res, 404, 'User not found.');

    // Prevent demoting/promoting to admin through this endpoint
    if (role === 'admin' && user.role !== 'admin') {
      return sendError(res, 403, 'Cannot assign admin role through this endpoint.');
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (department !== undefined) user.department = department;
    if (branch !== undefined) user.branch = branch;
    if (year !== undefined) user.year = Number(year);
    if (section !== undefined) user.section = section;
    if (rollNumber !== undefined) user.rollNumber = rollNumber;
    if (assignedSubjects !== undefined) user.assignedSubjects = assignedSubjects;
    if (assignedClass !== undefined) user.assignedClass = assignedClass;
    if (mentoringClasses !== undefined) user.mentoringClasses = mentoringClasses;
    if (headOfDepartments !== undefined) user.headOfDepartments = headOfDepartments;

    // Handle password reset
    if (req.body.password) {
      user.passwordHash = req.body.password;
      await user.save(); // triggers pre-save hash
    } else {
      await user.save({ validateModifiedOnly: true });
    }

    const updatedUser = await User.findById(user._id).select('-passwordHash');
    sendSuccess(res, 200, 'User updated.', { user: updatedUser });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/users/:id/status — admin only
const toggleUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return sendError(res, 404, 'User not found.');

    // Protect admin accounts
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
};

// GET /api/users/profile — get own profile (any authenticated user)
const getMyProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-passwordHash');
    sendSuccess(res, 200, 'Profile retrieved.', { user });
  } catch (error) {
    next(error);
  }
};

// PUT /api/users/profile — update own profile (limited fields)
const updateMyProfile = async (req, res, next) => {
  try {
    const { name, branch, year, section, rollNumber, department } = req.body;
    const user = await User.findById(req.user._id);

    if (name) user.name = name;
    if (branch) user.branch = branch;
    if (year) user.year = Number(year);
    if (section) user.section = section;
    if (rollNumber) user.rollNumber = rollNumber;
    if (department) user.department = department;

    // Password change
    if (req.body.currentPassword && req.body.newPassword) {
      const userWithPass = await User.findById(req.user._id).select('+passwordHash');
      const isMatch = await userWithPass.comparePassword(req.body.currentPassword);
      if (!isMatch) return sendError(res, 400, 'Current password is incorrect.');
      user.passwordHash = req.body.newPassword;
    }

    await user.save();
    const updated = await User.findById(user._id).select('-passwordHash');
    sendSuccess(res, 200, 'Profile updated.', { user: updated });
  } catch (error) {
    next(error);
  }
};

module.exports = { getUsers, getUserById, createUser, updateUser, toggleUserStatus, getMyProfile, updateMyProfile };
