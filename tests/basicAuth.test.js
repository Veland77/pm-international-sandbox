// tests/basicAuth.test.js
// Pure unit tests for the site-wide Basic Auth gate — no database involved.

const test = require("node:test");
const assert = require("node:assert/strict");
const { requireAuth } = require("../src/middleware/basicAuth");

function encodeCredentials(user, pass) {
  return Buffer.from(`${user}:${pass}`).toString("base64");
}

function mockRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    set(key, value) {
      this.headers[key] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

test("requireAuth calls next() when credentials match", () => {
  process.env.SANDBOX_USER = "demo";
  process.env.SANDBOX_PASSWORD = "secret";

  const req = { headers: { authorization: `Basic ${encodeCredentials("demo", "secret")}` } };
  const res = mockRes();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test("requireAuth returns 401 when credentials don't match", () => {
  process.env.SANDBOX_USER = "demo";
  process.env.SANDBOX_PASSWORD = "secret";

  const req = { headers: { authorization: `Basic ${encodeCredentials("demo", "wrong")}` } };
  const res = mockRes();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("requireAuth returns 401 when no Authorization header is present", () => {
  process.env.SANDBOX_USER = "demo";
  process.env.SANDBOX_PASSWORD = "secret";

  const req = { headers: {} };
  const res = mockRes();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.match(res.headers["WWW-Authenticate"], /Basic/);
});

test("requireAuth fails closed when env vars are unset, even with a correctly-shaped header", () => {
  delete process.env.SANDBOX_USER;
  delete process.env.SANDBOX_PASSWORD;

  const req = { headers: { authorization: `Basic ${encodeCredentials("demo", "secret")}` } };
  const res = mockRes();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});
