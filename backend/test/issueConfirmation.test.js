/**
 * Tests for uncertain AI image predictions: needs_confirmation at creation,
 * owner-only confirmation or correction, department and SLA calculated after
 * confirmation, and no department or monitor action before it.
 *
 * Uses node:test with stubbed model methods, so no MongoDB is needed.
 * Run with: npm test (from backend/).
 */

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');

const Complaint = require('../models/Complaint');
const Notification = require('../models/Notification');
const { requireRole } = require('../middleware/roleMiddleware');
const {
  createComplaint,
  confirmIssueType,
  updateDepartmentComplaintStatus,
  reviewCompletion,
} = require('../controllers/complaintController');
const { classifyImage } = require('../services/teachableMachineClassifier');
const {
  SUPPORTED_ISSUE_TYPES,
  AUTO_ROUTE_MIN_CONFIDENCE,
  AUTO_ROUTABLE_ISSUE_TYPES,
  isSupportedIssueType,
  needsIssueConfirmation,
  resolveIssueType,
} = require('../services/issueConfirmation');
const { DEPARTMENT_MAP } = require('../services/departmentRouter');
const { STATUS } = require('../services/complaintStatus');

const HOUR_MS = 60 * 60 * 1000;

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

const citizen = { id: 'citizen-1', role: 'citizen' };
const otherCitizen = { id: 'citizen-2', role: 'citizen' };
const authority = { id: 'auth-1', role: 'department', department: 'Road Department' };
const monitor = { id: 'mon-1', role: 'monitor' };

// A complaint saved by createComplaint when the image could not be classified.
const needsConfirmationFixture = (overrides = {}) => ({
  _id: 'c-1',
  user: 'citizen-1',
  description: 'Something on the road',
  issueType: 'other',
  status: STATUS.NEEDS_CONFIRMATION,
  imageClassification: {
    issueType: 'other',
    confidence: null,
    detected: false,
    modelAvailable: true,
    message: 'Model ran successfully but detected no known issue in the image',
  },
  ...overrides,
});

// A complaint that already has a department and an SLA, as created normally.
const submittedFixture = (overrides = {}) => ({
  _id: 'c-2',
  user: 'citizen-1',
  issueType: 'pothole',
  department: 'Road Department',
  status: STATUS.SUBMITTED,
  dueAt: new Date(Date.now() + 10 * HOUR_MS),
  escalationLevel: 0,
  ...overrides,
});

let notificationCreate;

beforeEach(() => {
  notificationCreate = mock.method(Notification, 'create', async () => ({}));
});

afterEach(() => {
  mock.restoreAll();
});

describe('issue type rules', () => {
  it('supported issue types are exactly the department map keys', () => {
    assert.deepEqual(SUPPORTED_ISSUE_TYPES, Object.keys(DEPARTMENT_MAP));
    assert.ok(SUPPORTED_ISSUE_TYPES.includes('other'));
  });

  it('rejects unknown, empty, and non-string issue types', () => {
    for (const value of ['unknown', '', 'POTHOLE', 'constructor', '__proto__', undefined, null, 42, ['pothole']]) {
      assert.equal(isSupportedIssueType(value), false, `${String(value)} must be rejected`);
    }
    assert.equal(isSupportedIssueType('pothole'), true);
  });

  it('a complaint with no image never needs confirmation', () => {
    assert.equal(needsIssueConfirmation({ hasImage: false, imageClassification: undefined }), false);
  });

  it('an image with a usable detection does not need confirmation', () => {
    const imageClassification = { issueType: 'pothole', confidence: 0.91, detected: true, modelAvailable: true };
    assert.equal(needsIssueConfirmation({ hasImage: true, imageClassification }), false);
  });

  it('an image with an unavailable model needs confirmation', () => {
    const imageClassification = { issueType: 'other', confidence: null, detected: false, modelAvailable: false };
    assert.equal(needsIssueConfirmation({ hasImage: true, imageClassification }), true);
  });

  it('an image with no detection needs confirmation', () => {
    const imageClassification = { issueType: 'other', confidence: null, detected: false, modelAvailable: true };
    assert.equal(needsIssueConfirmation({ hasImage: true, imageClassification }), true);
  });

  it('a result without the detected flag is treated as uncertain', () => {
    const imageClassification = { issueType: 'pothole', confidence: 0.9, modelAvailable: true };
    assert.equal(needsIssueConfirmation({ hasImage: true, imageClassification }), true);
  });

  it('a missing image file yields no invented confidence score', async () => {
    const result = await classifyImage('does/not/exist.jpg');
    assert.equal(result.modelAvailable, false);
    assert.equal(result.detected, false);
    assert.equal(result.confidence, null);
    assert.ok(result.message);
  });
});

// The provisional automatic-routing policy (see services/issueConfirmation.js).
// These rules are tested on resolveIssueType and needsIssueConfirmation directly,
// so every case is covered without a database.
describe('automatic routing policy (provisional threshold)', () => {
  const photo = (issueType, confidence) => ({ issueType, confidence, detected: true, modelAvailable: true });
  const text = (issueType) => ({ issueType, confidence: 0.95 });
  const autoRouted = (imageClassification, textResult = null) =>
    resolveIssueType({ hasImage: true, textResult, imageClassification }).needsConfirmation === false;

  it('the provisional threshold is 0.50 and the eligible types are pothole, garbage and streetlight', () => {
    assert.equal(AUTO_ROUTE_MIN_CONFIDENCE, 0.5);
    assert.deepEqual([...AUTO_ROUTABLE_ISSUE_TYPES].sort(), ['garbage', 'pothole', 'streetlight']);
  });

  for (const issueType of ['pothole', 'garbage', 'streetlight']) {
    it(`${issueType}: 0.49 needs confirmation, 0.50 and 0.90 route automatically`, () => {
      assert.equal(autoRouted(photo(issueType, 0.49)), false, '0.49 must not route');
      assert.equal(autoRouted(photo(issueType, 0.5)), true, '0.50 must route');
      assert.equal(autoRouted(photo(issueType, 0.9)), true, '0.90 must route');
      assert.equal(needsIssueConfirmation({ hasImage: true, imageClassification: photo(issueType, 0.9) }), false);
      assert.equal(needsIssueConfirmation({ hasImage: true, imageClassification: photo(issueType, 0.49) }), true);
    });
  }

  it('water_leakage always needs confirmation, at 0.49, 0.50 and 0.90', () => {
    for (const confidence of [0.49, 0.5, 0.9]) {
      assert.equal(autoRouted(photo('water_leakage', confidence)), false, `water_leakage at ${confidence}`);
    }
  });

  it('other (fallen tree) always needs confirmation, at 0.49, 0.50 and 0.90', () => {
    for (const confidence of [0.49, 0.5, 0.9]) {
      assert.equal(autoRouted(photo('other', confidence)), false, `other at ${confidence}`);
    }
  });

  it('a missing, null, or non-finite confidence needs confirmation for an otherwise eligible type', () => {
    for (const confidence of [undefined, null, NaN, Infinity, '0.9']) {
      const imageClassification = { issueType: 'pothole', confidence, detected: true, modelAvailable: true };
      assert.equal(autoRouted(imageClassification), false, `confidence ${String(confidence)} must not route`);
      assert.equal(needsIssueConfirmation({ hasImage: true, imageClassification }), true);
    }
  });

  it('no detection and an unavailable model need confirmation, for every class', () => {
    const noDetection = { issueType: 'other', confidence: null, detected: false, modelAvailable: true };
    const unavailable = { issueType: 'other', confidence: null, detected: false, modelAvailable: false };
    for (const imageClassification of [noDetection, unavailable, undefined]) {
      assert.equal(autoRouted(imageClassification), false);
      assert.equal(resolveIssueType({ hasImage: true, textResult: null, imageClassification }).confidence, undefined);
    }
  });

  it('a photo that disagrees with a specific description needs confirmation, even if confident', () => {
    const result = resolveIssueType({ hasImage: true, textResult: text('pothole'), imageClassification: photo('garbage', 0.9) });
    assert.equal(result.needsConfirmation, true);
    assert.equal(result.issueType, 'pothole', 'the description type is the suggestion');
  });

  it('a low-confidence photo that agrees with the description still needs confirmation', () => {
    const result = resolveIssueType({ hasImage: true, textResult: text('pothole'), imageClassification: photo('pothole', 0.3) });
    assert.equal(result.needsConfirmation, true);
    assert.equal(result.issueType, 'pothole');
    assert.equal(result.confidence, undefined);
  });

  it('a low-confidence photo-only complaint suggests the photo type, and needs no description', () => {
    const result = resolveIssueType({ hasImage: true, textResult: null, imageClassification: photo('streetlight', 0.3) });
    assert.equal(result.needsConfirmation, true);
    assert.equal(result.issueType, 'streetlight');
  });

  it('a confident photo that agrees with the description routes automatically', () => {
    assert.deepEqual(
      resolveIssueType({ hasImage: true, textResult: text('garbage'), imageClassification: photo('garbage', 0.5) }),
      { issueType: 'garbage', confidence: 0.5, needsConfirmation: false }
    );
  });

  it('a text-only complaint is unaffected by the image policy', () => {
    assert.equal(needsIssueConfirmation({ hasImage: false, imageClassification: undefined }), false);
    assert.deepEqual(resolveIssueType({ hasImage: false, textResult: text('pothole') }), {
      issueType: 'pothole',
      confidence: 0.95,
      needsConfirmation: false,
    });
  });
});

describe('creating a complaint with an uncertain image', () => {
  const uncertainRequest = () => ({
    user: citizen,
    body: { description: 'Broken thing near the school' },
    file: {
      filename: 'a.jpg',
      path: 'does/not/exist.jpg',
      originalname: 'a.jpg',
      mimetype: 'image/jpeg',
      size: 1000,
    },
  });

  it('saves the complaint as needs_confirmation with no department, SLA, or invented confidence', async () => {
    const create = mock.method(Complaint, 'create', async (data) => ({ _id: 'c-new', ...data }));
    const res = mockRes();

    await createComplaint(uncertainRequest(), res);

    assert.equal(res.statusCode, 201);
    const data = create.mock.calls[0].arguments[0];
    assert.equal(data.status, STATUS.NEEDS_CONFIRMATION);
    assert.equal(data.department, undefined);
    assert.equal(data.dueAt, undefined);
    assert.equal(data.confidence, undefined);
  });

  it('keeps the original AI result, including the model-unavailable message', async () => {
    const create = mock.method(Complaint, 'create', async (data) => ({ _id: 'c-new', ...data }));

    await createComplaint(uncertainRequest(), mockRes());

    const { imageClassification } = create.mock.calls[0].arguments[0];
    assert.equal(imageClassification.modelAvailable, false);
    assert.equal(imageClassification.detected, false);
    assert.equal(imageClassification.confidence, null);
    assert.equal(typeof imageClassification.message, 'string');
  });

  it('notifies the citizen to confirm, and does not announce a department yet', async () => {
    mock.method(Complaint, 'create', async (data) => ({ _id: 'c-new', ...data }));

    await createComplaint(uncertainRequest(), mockRes());

    const types = notificationCreate.mock.calls.map((call) => call.arguments[0].type);
    assert.deepEqual(types, ['complaint_created']);
  });

  it('a complaint with no photo is created normally, with department and SLA', async () => {
    const create = mock.method(Complaint, 'create', async (data) => ({ _id: 'c-new', ...data }));
    const res = mockRes();

    await createComplaint(
      { user: citizen, body: { description: 'There is a pothole on Main Street' } },
      res
    );

    assert.equal(res.statusCode, 201);
    const data = create.mock.calls[0].arguments[0];
    assert.equal(data.status, undefined, 'normal complaints keep the schema default status');
    assert.equal(data.issueType, 'pothole');
    assert.equal(data.department, 'Road Department');
    assert.ok(data.dueAt instanceof Date);
    assert.deepEqual(
      notificationCreate.mock.calls.map((call) => call.arguments[0].type).sort(),
      ['complaint_created', 'department_assigned']
    );
  });
});

describe('confirming or correcting the issue type', () => {
  it('rejects an invalid issue type before any database lookup', async () => {
    for (const issueType of ['unknown', '', undefined, 'Pothole']) {
      const find = mock.method(Complaint, 'findOne', async () => needsConfirmationFixture());
      const res = mockRes();
      await confirmIssueType({ user: citizen, params: { id: 'c-1' }, body: { issueType } }, res);
      assert.equal(res.statusCode, 400, `${String(issueType)} must be refused`);
      assert.equal(find.mock.callCount(), 0);
      mock.restoreAll();
      notificationCreate = mock.method(Notification, 'create', async () => ({}));
    }
  });

  it('looks the complaint up by owner, so another citizen gets 404', async () => {
    const find = mock.method(Complaint, 'findOne', async () => null);
    const update = mock.method(Complaint, 'findOneAndUpdate', async () => null);

    const res = mockRes();
    await confirmIssueType({ user: otherCitizen, params: { id: 'c-1' }, body: { issueType: 'pothole' } }, res);

    assert.equal(res.statusCode, 404);
    assert.equal(find.mock.calls[0].arguments[0].user, otherCitizen.id);
    assert.equal(update.mock.callCount(), 0);
  });

  it('refuses a complaint that does not need confirmation, without writing', async () => {
    mock.method(Complaint, 'findOne', async () => submittedFixture());
    const update = mock.method(Complaint, 'findOneAndUpdate', async () => null);

    const res = mockRes();
    await confirmIssueType({ user: citizen, params: { id: 'c-2' }, body: { issueType: 'garbage' } }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(update.mock.callCount(), 0);
  });

  it('confirming the suggested type keeps it and records a confirmation', async () => {
    mock.method(Complaint, 'findOne', async () => needsConfirmationFixture());
    const update = mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({
      ...needsConfirmationFixture(),
      ...body.$set,
    }));

    const res = mockRes();
    await confirmIssueType({ user: citizen, params: { id: 'c-1' }, body: { issueType: 'other' } }, res);

    assert.equal(res.statusCode, 200);
    const [filter, body] = update.mock.calls[0].arguments;
    assert.equal(filter.status, STATUS.NEEDS_CONFIRMATION);
    assert.equal(filter.user, citizen.id);
    assert.equal(body.$set.status, STATUS.SUBMITTED);
    assert.equal(body.$set.issueConfirmation.action, 'confirmed');
    assert.equal(body.$push.verificationHistory.action, 'issue_confirmed');
    assert.equal(body.$push.verificationHistory.actor, citizen.id);
  });

  it('correcting the type reassigns the department and recalculates the SLA from the new type', async () => {
    mock.method(Complaint, 'findOne', async () => needsConfirmationFixture());
    const update = mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({
      ...needsConfirmationFixture(),
      ...body.$set,
    }));

    const before = Date.now();
    const res = mockRes();
    await confirmIssueType({ user: citizen, params: { id: 'c-1' }, body: { issueType: 'pothole' } }, res);

    assert.equal(res.statusCode, 200);
    const body = update.mock.calls[0].arguments[1];
    assert.equal(body.$set.issueType, 'pothole');
    assert.equal(body.$set.department, 'Road Department', 'department comes from the existing mapping');
    assert.equal(body.$set.issueConfirmation.suggestedIssueType, 'other');
    assert.equal(body.$set.issueConfirmation.confirmedIssueType, 'pothole');
    assert.equal(body.$set.issueConfirmation.action, 'corrected');
    assert.equal(body.$push.verificationHistory.action, 'issue_corrected');

    // Pothole SLA is 24h; 'other' would have been 48h.
    const due = body.$set.dueAt.getTime();
    assert.ok(due >= before + 24 * HOUR_MS - 1000);
    assert.ok(due <= Date.now() + 24 * HOUR_MS + 1000);
  });

  it('a concurrent confirmation that already changed the status is refused', async () => {
    mock.method(Complaint, 'findOne', async () => needsConfirmationFixture());
    mock.method(Complaint, 'findOneAndUpdate', async () => null);

    const res = mockRes();
    await confirmIssueType({ user: citizen, params: { id: 'c-1' }, body: { issueType: 'garbage' } }, res);

    assert.equal(res.statusCode, 409);
  });

  it('after confirmation the department is notified of the assignment', async () => {
    mock.method(Complaint, 'findOne', async () => needsConfirmationFixture());
    mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({
      ...needsConfirmationFixture(),
      ...body.$set,
    }));

    await confirmIssueType({ user: citizen, params: { id: 'c-1' }, body: { issueType: 'streetlight' } }, mockRes());

    const types = notificationCreate.mock.calls.map((call) => call.arguments[0].type);
    assert.deepEqual(types, ['department_assigned']);
  });
});

describe('an uncertain complaint cannot skip verification', () => {
  it('a department cannot submit completion for an unconfirmed complaint', async () => {
    mock.method(Complaint, 'findOne', async () => needsConfirmationFixture({ department: 'Road Department' }));
    const update = mock.method(Complaint, 'findOneAndUpdate', async () => null);

    const res = mockRes();
    await updateDepartmentComplaintStatus({ user: authority, params: { id: 'c-1' }, body: { status: 'resolved' } }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(update.mock.callCount(), 0);
  });

  it('a department lookup does not return an unconfirmed complaint (it has no department)', async () => {
    const find = mock.method(Complaint, 'findOne', async () => null);

    const res = mockRes();
    await updateDepartmentComplaintStatus({ user: authority, params: { id: 'c-1' }, body: { status: 'resolved' } }, res);

    assert.equal(res.statusCode, 404);
    assert.equal(find.mock.calls[0].arguments[0].department, authority.department);
  });

  it('a monitor cannot review an unconfirmed complaint', async () => {
    mock.method(Complaint, 'findOne', async () => needsConfirmationFixture());
    const update = mock.method(Complaint, 'findOneAndUpdate', async () => null);

    for (const decision of ['approve', 'reject']) {
      const res = mockRes();
      await reviewCompletion(
        { user: monitor, params: { id: 'c-1' }, body: { decision, reason: 'bad' } },
        res
      );
      assert.equal(res.statusCode, 409, `${decision} must be refused`);
    }
    assert.equal(update.mock.callCount(), 0);
  });

  it('after confirmation the complaint follows the normal submit-for-verification path', async () => {
    const confirmed = submittedFixture({ department: 'Road Department' });
    mock.method(Complaint, 'findOne', async () => confirmed);
    const update = mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({
      ...confirmed,
      ...body.$set,
    }));

    const res = mockRes();
    await updateDepartmentComplaintStatus({ user: authority, params: { id: 'c-2' }, body: { status: 'resolved' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(update.mock.calls[0].arguments[1].$set.status, STATUS.PENDING_VERIFICATION);
  });
});

describe('role permissions around confirmation', () => {
  const runGuard = (role, roleList) => {
    const res = mockRes();
    let called = false;
    requireRole(...roleList)({ user: { role } }, res, () => {
      called = true;
    });
    return { called, res };
  };

  it('only citizens pass the confirmation guard', () => {
    assert.equal(runGuard('citizen', ['citizen']).called, true);
    for (const role of ['department', 'monitor', 'admin']) {
      const { called, res } = runGuard(role, ['citizen']);
      assert.equal(called, false, `${role} must not confirm issue types`);
      assert.equal(res.statusCode, 403);
    }
  });

  it('monitors keep only the review operations and gain no citizen privileges', () => {
    assert.equal(runGuard('monitor', ['monitor']).called, true);
    assert.equal(runGuard('monitor', ['citizen']).called, false);
  });
});
