const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const userRoutes = require('../routes/user.routes');
const adminRoutes = require('../routes/admin.routes');

const testSecret = 'campusflow-profile-route-test-secret';
const originalJwtSecret = process.env.JWT_SECRET;
let originalFindById;
let server;
let user;
let baseUrl;

const createUser = (role = 'student') => ({
  _id: 'profile-test-user',
  name: 'Test User',
  email: 'test-user@example.invalid',
  role,
  department: 'Engineering',
  branch: 'Computer Science',
  year: 2,
  section: 'A',
  rollNumber: 'TEST-001',
  assignedSubjects: [{ subjectName: 'Test Subject' }],
  assignedClass: { branch: 'Computer Science', year: 2, section: 'A' },
  mentoringClasses: [{ branch: 'Computer Science', year: 2, section: 'A' }],
  headOfDepartments: ['Engineering'],
  isActive: true,
  passwordHash: 'stored-hash',
  comparePassword: async (candidate) => candidate === 'correct-current-password',
  save: async function () {
    this.saveCount = (this.saveCount || 0) + 1;
  },
  toPublicProfile: function () {
    const { passwordHash, ...profile } = this;
    return profile;
  },
});

const makeQuery = (result) => ({
  select: async () => result,
  then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
});

const tokenFor = (role = user.role, id = user._id) =>
  jwt.sign({ id, role }, testSecret);

const send = async (path, { method = 'PUT', body, token } = {}) => {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, data: await response.json() };
};

describe('profile update security', () => {
  beforeEach(async () => {
    process.env.JWT_SECRET = testSecret;
    originalFindById = User.findById;
    user = createUser();
    User.findById = (id) => makeQuery(String(id) === user._id ? user : null);

    const app = express();
    app.use(express.json());
    app.use('/api/users', userRoutes);
    app.use('/api/admin', adminRoutes);
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.once('listening', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  });

  afterEach(async () => {
    User.findById = originalFindById;
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      server = null;
    }
  });

  it('allows an authenticated student to update their name', async () => {
    const { response, data } = await send('/users/profile', {
      body: { name: 'Updated Name' },
      token: tokenFor(),
    });

    assert.equal(response.status, 200);
    assert.equal(data.user.name, 'Updated Name');
    assert.equal(user.branch, 'Computer Science');
  });

  for (const [field, value] of [
    ['branch', 'Changed Branch'],
    ['year', 4],
    ['section', 'B'],
    ['role', 'admin'],
    ['rollNumber', 'CHANGED-001'],
    ['department', 'Changed Department'],
    ['assignedSubjects', []],
    ['assignedClass', { branch: 'Changed Branch', year: 4, section: 'B' }],
    ['mentoringClasses', []],
    ['headOfDepartments', []],
    ['isActive', false],
  ]) {
    it(`rejects self-service changes to ${field}`, async () => {
      const { response, data } = await send('/users/profile', {
        body: { [field]: value },
        token: tokenFor(),
      });

      assert.equal(response.status, 400);
      assert.match(data.message, /only be changed by an administrator/i);
      assert.equal(user.saveCount, undefined);
    });
  }

  it('rejects faculty assignment changes by authenticated staff', async () => {
    user.role = 'teacher';
    const { response, data } = await send('/users/profile', {
      body: {
        assignedSubjects: [],
        assignedClass: {},
        mentoringClasses: [],
        headOfDepartments: [],
      },
      token: tokenFor(),
    });

    assert.equal(response.status, 400);
    assert.match(data.message, /only be changed by an administrator/i);
    assert.equal(user.saveCount, undefined);
  });

  it('allows an authenticated user to change password with the correct current password', async () => {
    const { response, data } = await send('/users/profile', {
      body: {
        currentPassword: 'correct-current-password',
        newPassword: 'new-password',
      },
      token: tokenFor(),
    });

    assert.equal(response.status, 200);
    assert.equal(user.passwordHash, 'new-password');
    assert.equal(user.saveCount, 1);
    assert.equal(data.success, true);
  });

  it('rejects an incorrect current password', async () => {
    const { response, data } = await send('/users/profile', {
      body: { currentPassword: 'incorrect', newPassword: 'new-password' },
      token: tokenFor(),
    });

    assert.equal(response.status, 400);
    assert.equal(data.message, 'Current password is incorrect.');
    assert.equal(user.passwordHash, 'stored-hash');
    assert.equal(user.saveCount, undefined);
  });

  it('rejects unauthenticated profile updates', async () => {
    const { response } = await send('/users/profile', { body: { name: 'Updated Name' } });

    assert.equal(response.status, 401);
  });

  it('allows an administrator to update academic information through user management', async () => {
    const admin = createUser('admin');
    admin._id = 'admin-test-user';
    const target = user;
    User.findById = (id) => makeQuery(String(id) === admin._id ? admin : target);

    const { response, data } = await send('/admin/users/profile-test-user', {
      body: { branch: 'Updated Branch', year: 3, section: 'C' },
      token: tokenFor('admin', admin._id),
    });

    assert.equal(response.status, 200);
    assert.equal(target.branch, 'Updated Branch');
    assert.equal(target.year, 3);
    assert.equal(target.section, 'C');
    assert.equal(data.user.branch, 'Updated Branch');
  });
});
