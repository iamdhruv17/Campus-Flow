const assert = require('node:assert/strict');
const { describe, it, beforeEach, afterEach } = require('node:test');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth.middleware');
const { requireCsrfToken } = require('../middleware/csrf.middleware');
const { logout } = require('../controllers/auth.controller');

const secret = 'campusflow-security-test-secret';
let originalFindById;

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  cookies: [],
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
  cookie(name, value, options) {
    this.cookies.push({ name, value, options });
    return this;
  },
  clearCookie(name, options) {
    this.cookies.push({ name, value: undefined, options });
    return this;
  },
});

const makeUserQuery = (user) => ({
  select: async () => user,
});

const runProtect = async (token, user) => {
  User.findById = () => makeUserQuery(user);
  const req = { cookies: { token }, headers: {} };
  const res = makeResponse();
  let called = false;
  await protect(req, res, () => {
    called = true;
  });
  return { req, res, called };
};

describe('security middleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = secret;
    originalFindById = User.findById;
  });

  afterEach(() => {
    User.findById = originalFindById;
    delete process.env.JWT_SECRET;
  });

  it('rejects invalid and expired JWTs', async () => {
    const invalid = await runProtect('not-a-jwt', { isActive: true, tokenVersion: 0 });
    assert.equal(invalid.res.statusCode, 401);
    assert.equal(invalid.res.body.message, 'Invalid token.');

    const expiredToken = jwt.sign({ id: 'user', tokenVersion: 0 }, secret, { expiresIn: -1 });
    const expired = await runProtect(expiredToken, { isActive: true, tokenVersion: 0 });
    assert.equal(expired.res.statusCode, 401);
    assert.equal(expired.res.body.message, 'Token expired. Please log in again.');
  });

  it('rejects deactivated users and tokens from before a password change', async () => {
    const token = jwt.sign({ id: 'user', tokenVersion: 0 }, secret);
    const deactivated = await runProtect(token, { isActive: false, tokenVersion: 0 });
    assert.equal(deactivated.res.statusCode, 403);

    const revoked = await runProtect(token, { isActive: true, tokenVersion: 1 });
    assert.equal(revoked.res.statusCode, 401);
    assert.equal(revoked.res.body.message, 'Session expired. Please log in again.');
  });

  it('requires a matching CSRF token for cookie-authenticated writes', () => {
    const missing = makeResponse();
    requireCsrfToken(
      { method: 'POST', cookies: { token: 'jwt' }, get: () => undefined },
      missing,
      () => assert.fail('missing CSRF token should be rejected')
    );
    assert.equal(missing.statusCode, 403);

    const valid = makeResponse();
    requireCsrfToken(
      {
        method: 'POST',
        cookies: { token: 'jwt', csrfToken: 'csrf-value' },
        get: () => 'csrf-value',
      },
      valid,
      () => {
        valid.statusCode = 204;
      }
    );
    assert.equal(valid.statusCode, 204);
  });

  it('clears both authentication cookies on logout', () => {
    const res = makeResponse();
    logout({}, res);
    assert.deepEqual(
      res.cookies.map((cookie) => cookie.name),
      ['token', 'csrfToken']
    );
  });
});
