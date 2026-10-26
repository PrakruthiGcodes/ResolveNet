/**
 * Focused tests for the monitor-wide complaint list (GET /api/complaints/monitor).
 *
 * Uses Node's built-in test runner (node:test). Model methods are stubbed, so
 * these tests run without MongoDB. Run with: npm test (from backend/).
 */

const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');

const Complaint = require('../models/Complaint');
const complaintRoutes = require('../routes/complaintRoutes');
const { getAllComplaintsForMonitor } = require('../controllers/complaintController');

const mockRes = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

const monitor = { id: 'mon-1', role: 'monitor' };

// Express 5 keeps the registered routes on router.stack. Each layer with a
// `route` has a path and the HTTP methods it answers.
const routeLayers = () => complaintRoutes.stack.filter((layer) => layer.route);

afterEach(() => {
  mock.restoreAll();
});

describe('monitor complaint list route', () => {
  it('is registered before /:id, so "monitor" is not read as a complaint id', () => {
    const paths = routeLayers().map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));
    const monitorIndex = paths.findIndex((p) => p.path === '/monitor' && p.methods.includes('get'));
    const idIndex = paths.findIndex((p) => p.path === '/:id');

    assert.notEqual(monitorIndex, -1, 'GET /monitor must be registered');
    assert.notEqual(idIndex, -1, 'GET /:id must be registered');
    assert.ok(monitorIndex < idIndex, 'GET /monitor must come before GET /:id');
  });

  it('refuses every non-monitor role with 403 before the handler runs', () => {
    const layer = routeLayers().find((l) => l.route.path === '/monitor');
    // Stack order is protect, requireRole('monitor'), handler.
    const roleGuard = layer.route.stack[1].handle;

    for (const role of ['citizen', 'department', 'admin']) {
      let called = false;
      const res = mockRes();
      roleGuard({ user: { role } }, res, () => {
        called = true;
      });
      assert.equal(called, false, `${role} must not reach the handler`);
      assert.equal(res.statusCode, 403);
    }
  });

  it('lets a monitor through to the handler', () => {
    const layer = routeLayers().find((l) => l.route.path === '/monitor');
    const roleGuard = layer.route.stack[1].handle;
    let called = false;
    roleGuard({ user: monitor }, mockRes(), () => {
      called = true;
    });
    assert.equal(called, true);
  });
});

describe('getAllComplaintsForMonitor', () => {
  it('queries every status, sorts newest first, and selects history without the citizen', async () => {
    const complaints = [{ _id: 'c-2' }, { _id: 'c-1' }];
    const captured = {};
    mock.method(Complaint, 'find', (filter) => {
      captured.filter = filter;
      return {
        select(fields) {
          captured.fields = fields;
          return this;
        },
        sort(order) {
          captured.sort = order;
          return Promise.resolve(complaints);
        },
      };
    });

    const res = mockRes();
    await getAllComplaintsForMonitor({ user: monitor }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { complaints });
    assert.deepEqual(captured.filter, {}, 'no status filter: all statuses are returned');
    assert.deepEqual(captured.sort, { createdAt: -1 }, 'newest first');

    const fields = captured.fields.split(/\s+/);
    assert.ok(fields.includes('verificationHistory'), 'history entries are included');
    assert.ok(fields.includes('workStartedAt'), 'work-started date is included');
    assert.ok(fields.includes('status'), 'current status is included');
    assert.ok(!fields.includes('user'), 'the citizen reference is excluded');
    assert.ok(!fields.includes('location'), 'the location is excluded');
  });

  it('returns 500 with a message when the query fails', async () => {
    mock.method(Complaint, 'find', () => ({
      select() {
        return this;
      },
      sort() {
        return Promise.reject(new Error('database unavailable'));
      },
    }));

    const res = mockRes();
    await getAllComplaintsForMonitor({ user: monitor }, res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, 'Failed to fetch complaints');
  });
});
