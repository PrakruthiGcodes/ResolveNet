/**
 * Focused tests for authenticated complaint-photo access
 * (GET /api/complaints/:id/image).
 *
 * Uses Node's built-in test runner (node:test). The Complaint lookup and the
 * file-system checks are stubbed, so these tests never connect to MongoDB and
 * never read or write the real uploads folder. Run with: npm test (from backend/).
 */

const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const Complaint = require('../models/Complaint');
const complaintRoutes = require('../routes/complaintRoutes');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { UPLOAD_DIR } = require('../middleware/uploadMiddleware');
const {
  getComplaintImage,
  resolveStoredImagePath,
  canViewComplaintImage,
} = require('../controllers/complaintController');

const OWNER_ID = '64b000000000000000000001';
const OTHER_CITIZEN_ID = '64b000000000000000000002';
const COMPLAINT_ID = '64c000000000000000000001';
const OTHER_COMPLAINT_ID = '64c000000000000000000002';
const FILENAME = '1792500000000-0123456789abcdef0123456789abcdef.jpg';

const citizen = (id = OWNER_ID) => ({ id, role: 'citizen' });
const department = (name = 'Road Department') => ({ id: 'd-1', role: 'department', department: name });
const monitor = { id: 'm-1', role: 'monitor' };

const complaintFixture = (overrides = {}) => ({
  _id: COMPLAINT_ID,
  user: OWNER_ID,
  department: 'Road Department',
  image: { filename: FILENAME, url: `/uploads/${FILENAME}` },
  ...overrides,
});

const mockRes = () => {
  const res = { statusCode: 200, body: undefined, headersSent: false, headers: {} };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  res.set = (values) => {
    Object.assign(res.headers, values);
    return res;
  };
  res.sendFile = mock.fn((filePath, callback) => {
    res.sentPath = filePath;
    callback?.();
    return res;
  });
  return res;
};

const requestFor = (user, id = COMPLAINT_ID) => ({ params: { id }, user });

// Stubs the complaint lookup and reports whether the file exists on disk.
const stubLookup = (complaint, { fileExists = true } = {}) => {
  mock.method(Complaint, 'findById', async () => complaint);
  mock.method(fs, 'existsSync', () => fileExists);
};

afterEach(() => {
  mock.restoreAll();
});

describe('authentication', () => {
  it('denies a request with no token, before any lookup', async () => {
    const res = mockRes();
    const next = mock.fn();

    await protect({ headers: {} }, res, next);

    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.callCount(), 0);
  });

  it('denies a request with an invalid token, before any lookup', async () => {
    const res = mockRes();
    const next = mock.fn();

    await protect({ headers: { authorization: 'Bearer not-a-real-token' } }, res, next);

    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.callCount(), 0);
  });

  it('is registered on the image route ahead of the handler', () => {
    const layer = complaintRoutes.stack.find((item) => item.route && item.route.path === '/:id/image');
    assert.ok(layer, 'image route is registered');
    const names = layer.route.stack.map((item) => item.name);
    assert.equal(names[0], 'protect');
    assert.equal(names[names.length - 1], 'getComplaintImage');
  });

  it('keeps the uploads folder out of the public static mount', () => {
    // Regression guard: a static /uploads mount would serve every photo without
    // a login.
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.doesNotMatch(serverSource, /express\.static/);
    assert.doesNotMatch(serverSource, /['"]\/uploads['"]/);
  });
});

describe('role gate', () => {
  it('refuses admin accounts, which have no complaint access', () => {
    const res = mockRes();
    const next = mock.fn();

    requireRole('citizen', 'department', 'monitor')({ user: { role: 'admin' } }, res, next);

    assert.equal(res.statusCode, 403);
    assert.equal(next.mock.callCount(), 0);
  });
});

describe('authorization rules', () => {
  it('lets a citizen see their own complaint', () => {
    assert.equal(canViewComplaintImage(citizen(), complaintFixture()), true);
  });

  it('does not let a citizen see another citizen’s complaint', () => {
    assert.equal(canViewComplaintImage(citizen(OTHER_CITIZEN_ID), complaintFixture()), false);
  });

  it('lets a department see complaints assigned to its department only', () => {
    assert.equal(canViewComplaintImage(department('Road Department'), complaintFixture()), true);
    assert.equal(canViewComplaintImage(department('Water Department'), complaintFixture()), false);
  });

  it('refuses a department account with no department', () => {
    assert.equal(canViewComplaintImage({ id: 'd-2', role: 'department' }, complaintFixture()), false);
  });

  it('does not let a department see a complaint with no department yet', () => {
    const unrouted = complaintFixture({ department: undefined });
    assert.equal(canViewComplaintImage(department('Road Department'), unrouted), false);
  });

  it('lets a monitor see any complaint, as the monitor list already does', () => {
    assert.equal(canViewComplaintImage(monitor, complaintFixture()), true);
  });
});

describe('getComplaintImage handler', () => {
  it('serves the photo to the owner, with private caching headers', async () => {
    stubLookup(complaintFixture());
    const res = mockRes();

    await getComplaintImage(requestFor(citizen()), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.sentPath, path.join(UPLOAD_DIR, FILENAME));
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  });

  it('serves the photo to a department that owns the complaint', async () => {
    stubLookup(complaintFixture());
    const res = mockRes();

    await getComplaintImage(requestFor(department('Road Department')), res);

    assert.equal(res.sentPath, path.join(UPLOAD_DIR, FILENAME));
  });

  it('serves the photo to a monitor for a complaint that is not theirs', async () => {
    stubLookup(complaintFixture({ _id: OTHER_COMPLAINT_ID }));
    const res = mockRes();

    await getComplaintImage(requestFor(monitor, OTHER_COMPLAINT_ID), res);

    assert.equal(res.sentPath, path.join(UPLOAD_DIR, FILENAME));
  });

  it('denies a different citizen with the same 404 as a missing photo', async () => {
    stubLookup(complaintFixture());
    const res = mockRes();

    await getComplaintImage(requestFor(citizen(OTHER_CITIZEN_ID)), res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { message: 'Image not found' });
    assert.equal(res.sendFile.mock.callCount(), 0);
  });

  it('denies a department that did not get the complaint', async () => {
    stubLookup(complaintFixture());
    const res = mockRes();

    await getComplaintImage(requestFor(department('Water Department')), res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.sendFile.mock.callCount(), 0);
  });

  it('returns 404 for a complaint that does not exist', async () => {
    stubLookup(null);
    const res = mockRes();

    await getComplaintImage(requestFor(citizen()), res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.sendFile.mock.callCount(), 0);
  });

  it('returns 404 for a complaint with no photo attached', async () => {
    stubLookup(complaintFixture({ image: undefined }));
    const res = mockRes();

    await getComplaintImage(requestFor(citizen()), res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.sendFile.mock.callCount(), 0);
  });

  it('returns 404 when the photo file is missing from disk', async () => {
    stubLookup(complaintFixture(), { fileExists: false });
    const res = mockRes();

    await getComplaintImage(requestFor(citizen()), res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.sendFile.mock.callCount(), 0);
  });

  it('returns 404 without a lookup for a malformed complaint id', async () => {
    const findById = mock.method(Complaint, 'findById', async () => complaintFixture());
    const res = mockRes();

    await getComplaintImage(requestFor(citizen(), '../../etc'), res);

    assert.equal(res.statusCode, 404);
    assert.equal(findById.mock.callCount(), 0);
  });

  it('returns 404 when sendFile fails before the response starts', async () => {
    stubLookup(complaintFixture());
    const res = mockRes();
    res.sendFile = mock.fn((filePath, callback) => {
      callback(new Error('read failed'));
      return res;
    });

    await getComplaintImage(requestFor(citizen()), res);

    assert.equal(res.statusCode, 404);
  });
});

describe('stored image path validation', () => {
  it('accepts a name the upload middleware could have produced', () => {
    assert.equal(resolveStoredImagePath(FILENAME), path.join(UPLOAD_DIR, FILENAME));
  });

  it('rejects traversal and path-like names', () => {
    const invalid = [
      '../server.js',
      '..\\server.js',
      '../../.env',
      '/etc/passwd',
      'C:\\Windows\\win.ini',
      `subdir/${FILENAME}`,
    ];
    for (const name of invalid) {
      assert.equal(resolveStoredImagePath(name), null, `should reject ${name}`);
    }
  });

  it('rejects names with the wrong shape or extension', () => {
    const invalid = [
      'photo.jpg',
      `${FILENAME}.exe`,
      FILENAME.replace('.jpg', '.svg'),
      FILENAME.slice(0, -1),
      '',
      undefined,
      null,
      42,
    ];
    for (const name of invalid) {
      assert.equal(resolveStoredImagePath(name), null, `should reject ${String(name)}`);
    }
  });

  it('does not touch the file system for a traversal attempt through the handler', async () => {
    const existsSync = mock.method(fs, 'existsSync', () => true);
    mock.method(Complaint, 'findById', async () => complaintFixture({ image: { filename: '../../.env' } }));
    const res = mockRes();

    await getComplaintImage(requestFor(citizen()), res);

    assert.equal(res.statusCode, 404);
    assert.equal(existsSync.mock.callCount(), 0);
    assert.equal(res.sendFile.mock.callCount(), 0);
  });
});
