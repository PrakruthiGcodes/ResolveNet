/**
 * Focused tests for completion verification, role permissions, and SLA /
 * escalation behaviour.
 *
 * Uses Node's built-in test runner (node:test), so no extra dependency is
 * needed. Model methods are stubbed, so these tests run without MongoDB.
 * Run with: npm test (from backend/).
 */

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');

// Needed by generateToken() during the registration test. This is a dummy
// value used only inside the test process.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret';

const Complaint = require('../models/Complaint');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { requireRole } = require('../middleware/roleMiddleware');
const { registerUser } = require('../controllers/authController');
const {
  updateDepartmentComplaintStatus,
  updateDepartmentWorkStatus,
  reviewCompletion,
  getPendingVerificationComplaints,
} = require('../controllers/complaintController');
const { runEscalationCheck } = require('../services/escalationService');
const { calculateReworkDueAt, REWORK_SLA_HOURS } = require('../services/slaConfig');
const { STATUS, COMPLAINT_STATUSES, WORK_STATUS, WORK_STATUSES } = require('../services/complaintStatus');

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

const authority = { id: 'auth-1', role: 'department', department: 'Road Department' };
const monitor = { id: 'mon-1', role: 'monitor', department: undefined };

const complaintFixture = (overrides = {}) => ({
  _id: 'c-1',
  user: 'citizen-1',
  department: 'Road Department',
  status: STATUS.SUBMITTED,
  dueAt: new Date(Date.now() + 10 * HOUR_MS),
  escalationLevel: 0,
  ...overrides,
});

// Notifications are secondary and must never touch a real database in tests.
let notificationCreate;

beforeEach(() => {
  notificationCreate = mock.method(Notification, 'create', async () => ({}));
});

afterEach(() => {
  mock.restoreAll();
});

describe('role guard', () => {
  const run = (role) => {
    const req = { user: role ? { role } : undefined };
    const res = mockRes();
    let called = false;
    requireRole('monitor')(req, res, () => {
      called = true;
    });
    return { called, res };
  };

  it('allows only the monitor role through requireRole("monitor")', () => {
    assert.equal(run('monitor').called, true);
  });

  it('blocks citizen, department, and admin accounts with 403', () => {
    for (const role of ['citizen', 'department', 'admin']) {
      const { called, res } = run(role);
      assert.equal(called, false, `${role} must not pass`);
      assert.equal(res.statusCode, 403);
    }
  });

  it('blocks a request with no authenticated user', () => {
    const { called, res } = run(null);
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
  });
});

describe('public registration cannot create privileged accounts', () => {
  it('always creates a citizen, even when the body asks for monitor or department', async () => {
    mock.method(User, 'findOne', async () => null);
    const create = mock.method(User, 'create', async (data) => ({
      _id: 'new-user',
      name: data.name,
      email: data.email,
      role: data.role,
      department: data.department,
    }));

    for (const role of ['monitor', 'department', 'admin']) {
      const res = mockRes();
      await registerUser(
        {
          body: {
            name: 'Test Person',
            email: `person-${role}@example.com`,
            password: 'secret123',
            role,
            department: 'Road Department',
          },
        },
        res
      );
      assert.equal(res.statusCode, 201);
    }

    for (const call of create.mock.calls) {
      assert.equal(call.arguments[0].role, 'citizen');
      assert.equal(call.arguments[0].department, undefined);
    }
  });
});

describe('model status and role validation', () => {
  it('lists the lifecycle statuses', () => {
    assert.deepEqual(COMPLAINT_STATUSES, ['submitted', 'needs_confirmation', 'pending_verification', 'resolved']);
  });

  it('accepts pending_verification and rejects unknown statuses', async () => {
    const ok = new Complaint({ user: '64b000000000000000000001', description: 'x', status: 'pending_verification' });
    await ok.validate();

    const bad = new Complaint({ user: '64b000000000000000000001', description: 'x', status: 'approved' });
    await assert.rejects(bad.validate(), (error) => error.errors.status !== undefined);
  });

  it('accepts the monitor role and still rejects unknown roles', async () => {
    const monitorUser = new User({ name: 'M', email: 'm@example.com', password: 'secret123', role: 'monitor' });
    await monitorUser.validate();

    const unknown = new User({ name: 'U', email: 'u@example.com', password: 'secret123', role: 'superuser' });
    await assert.rejects(unknown.validate(), (error) => error.errors.role !== undefined);
  });
});

describe('department completion submission', () => {
  it('moves a submitted complaint to pending_verification, not resolved', async () => {
    mock.method(Complaint, 'findOne', async () => complaintFixture());
    const update = mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({
      ...complaintFixture(),
      status: body.$set.status,
      user: 'citizen-1',
    }));

    const res = mockRes();
    await updateDepartmentComplaintStatus(
      { user: authority, params: { id: 'c-1' }, body: { status: 'resolved' } },
      res
    );

    assert.equal(res.statusCode, 200);
    const [filter, body] = update.mock.calls[0].arguments;
    assert.equal(filter.status, STATUS.SUBMITTED, 'update must be guarded by the current status');
    assert.equal(body.$set.status, STATUS.PENDING_VERIFICATION);
    assert.notEqual(body.$set.status, STATUS.RESOLVED);
    assert.equal(body.$set['verification.submittedBy'], authority.id);
    assert.equal(body.$push.verificationHistory.action, 'completion_submitted');
    // No citizen notification at submission. Only approval resolves it.
    assert.equal(notificationCreate.mock.callCount(), 0);
  });

  it('rejects a second submission while pending, without writing', async () => {
    mock.method(Complaint, 'findOne', async () => complaintFixture({ status: STATUS.PENDING_VERIFICATION }));
    const update = mock.method(Complaint, 'findOneAndUpdate', async () => null);

    const res = mockRes();
    await updateDepartmentComplaintStatus(
      { user: authority, params: { id: 'c-1' }, body: { status: 'resolved' } },
      res
    );

    assert.equal(res.statusCode, 409);
    assert.equal(update.mock.callCount(), 0);
  });

  it('cannot submit an already-resolved complaint', async () => {
    mock.method(Complaint, 'findOne', async () => complaintFixture({ status: STATUS.RESOLVED }));
    const update = mock.method(Complaint, 'findOneAndUpdate', async () => null);

    const res = mockRes();
    await updateDepartmentComplaintStatus(
      { user: authority, params: { id: 'c-1' }, body: { status: 'resolved' } },
      res
    );

    assert.equal(res.statusCode, 409);
    assert.equal(update.mock.callCount(), 0);
  });

  it('no longer accepts "submitted" from the department (no bypass of verification)', async () => {
    const find = mock.method(Complaint, 'findOne', async () => complaintFixture());

    const res = mockRes();
    await updateDepartmentComplaintStatus(
      { user: authority, params: { id: 'c-1' }, body: { status: 'submitted' } },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(find.mock.callCount(), 0, 'invalid status must be rejected before any lookup');
  });

  it('escalates at submission when the deadline already passed and no escalation happened yet', async () => {
    const overdue = complaintFixture({ dueAt: new Date(Date.now() - HOUR_MS), escalationLevel: 0 });
    mock.method(Complaint, 'findOne', async () => overdue);
    // No department or monitor accounts, so only the citizen is notified.
    mock.method(User, 'find', async () => []);
    const update = mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({
      ...overdue,
      ...body.$set,
    }));

    const res = mockRes();
    await updateDepartmentComplaintStatus(
      { user: authority, params: { id: 'c-1' }, body: { status: 'resolved' } },
      res
    );

    assert.equal(res.statusCode, 200);
    const body = update.mock.calls[0].arguments[1];
    assert.equal(body.$set.escalationLevel, 1);
    assert.ok(body.$set.escalatedAt instanceof Date);
    assert.equal(body.$set.status, STATUS.PENDING_VERIFICATION);
    assert.equal(notificationCreate.mock.callCount(), 1);
    assert.equal(notificationCreate.mock.calls[0].arguments[0].type, 'complaint_escalated');
  });

  it('does not change escalation when the deadline has not passed', async () => {
    mock.method(Complaint, 'findOne', async () => complaintFixture());
    const update = mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({ ...complaintFixture(), ...body.$set }));

    await updateDepartmentComplaintStatus(
      { user: authority, params: { id: 'c-1' }, body: { status: 'resolved' } },
      mockRes()
    );

    const body = update.mock.calls[0].arguments[1];
    assert.equal('escalationLevel' in body.$set, false);
    assert.equal('escalatedAt' in body.$set, false);
  });
});

describe('monitor review: approval and rejection', () => {
  const pending = () => complaintFixture({ status: STATUS.PENDING_VERIFICATION, escalationLevel: 0 });

  it('approve sets resolved, records the reviewer and time, and notifies the citizen', async () => {
    mock.method(Complaint, 'findOne', async () => pending());
    const update = mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({
      ...pending(),
      ...body.$set,
    }));

    const res = mockRes();
    await reviewCompletion({ user: monitor, params: { id: 'c-1' }, body: { decision: 'approve' } }, res);

    assert.equal(res.statusCode, 200);
    const [filter, body] = update.mock.calls[0].arguments;
    assert.equal(filter.status, STATUS.PENDING_VERIFICATION);
    assert.equal(body.$set.status, STATUS.RESOLVED);
    assert.equal(body.$set['verification.reviewedBy'], monitor.id);
    assert.ok(body.$set['verification.reviewedAt'] instanceof Date);
    assert.equal(body.$push.verificationHistory.action, 'approved');
    assert.equal(notificationCreate.mock.calls[0].arguments[0].type, 'complaint_resolved');
  });

  it('reject without a reason is refused before any database access', async () => {
    const find = mock.method(Complaint, 'findOne', async () => pending());

    for (const reason of [undefined, '', '   ']) {
      const res = mockRes();
      await reviewCompletion({ user: monitor, params: { id: 'c-1' }, body: { decision: 'reject', reason } }, res);
      assert.equal(res.statusCode, 400);
    }
    assert.equal(find.mock.callCount(), 0);
  });

  it('reject longer than 1000 characters is refused', async () => {
    const res = mockRes();
    await reviewCompletion(
      { user: monitor, params: { id: 'c-1' }, body: { decision: 'reject', reason: 'x'.repeat(1001) } },
      res
    );
    assert.equal(res.statusCode, 400);
  });

  it('reject returns the complaint to submitted with a rework deadline and keeps history', async () => {
    mock.method(Complaint, 'findOne', async () => pending());
    const update = mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({ ...pending(), ...body.$set }));

    const before = Date.now();
    const res = mockRes();
    await reviewCompletion(
      { user: monitor, params: { id: 'c-1' }, body: { decision: 'reject', reason: '  Pothole still open  ' } },
      res
    );

    assert.equal(res.statusCode, 200);
    const [filter, body] = update.mock.calls[0].arguments;
    assert.equal(filter.status, STATUS.PENDING_VERIFICATION);
    assert.equal(body.$set.status, STATUS.SUBMITTED);
    assert.equal(body.$set['verification.rejectionReason'], 'Pothole still open', 'reason is trimmed');
    assert.equal(body.$set['verification.reviewedBy'], monitor.id);
    assert.equal(body.$push.verificationHistory.action, 'rejected');
    assert.equal(body.$push.verificationHistory.reason, 'Pothole still open');

    // Rework deadline: roughly now + REWORK_SLA_HOURS.
    const due = body.$set.dueAt.getTime();
    assert.ok(due >= before + REWORK_SLA_HOURS * HOUR_MS - 1000);
    assert.ok(due <= Date.now() + REWORK_SLA_HOURS * HOUR_MS + 1000);
    // The citizen is told about the failed verification (see the decision
    // notification tests below).
    assert.equal(notificationCreate.mock.callCount(), 1);
    assert.equal(notificationCreate.mock.calls[0].arguments[0].type, 'complaint_verification_failed');
  });

  it('rejects an invalid decision', async () => {
    const res = mockRes();
    await reviewCompletion({ user: monitor, params: { id: 'c-1' }, body: { decision: 'maybe' } }, res);
    assert.equal(res.statusCode, 400);
  });

  it('cannot review a complaint that is not pending verification', async () => {
    for (const status of [STATUS.SUBMITTED, STATUS.RESOLVED]) {
      mock.method(Complaint, 'findOne', async () => complaintFixture({ status }));
      const update = mock.method(Complaint, 'findOneAndUpdate', async () => null);
      const res = mockRes();
      await reviewCompletion({ user: monitor, params: { id: 'c-1' }, body: { decision: 'approve' } }, res);
      assert.equal(res.statusCode, 409, `review must be refused for status ${status}`);
      assert.equal(update.mock.callCount(), 0);
      mock.restoreAll();
      notificationCreate = mock.method(Notification, 'create', async () => ({}));
    }
  });

  it('returns 404 for an unknown complaint', async () => {
    mock.method(Complaint, 'findOne', async () => null);
    const res = mockRes();
    await reviewCompletion({ user: monitor, params: { id: 'missing' }, body: { decision: 'approve' } }, res);
    assert.equal(res.statusCode, 404);
  });

  it('pending-verification list is filtered to pending complaints only', async () => {
    const find = mock.method(Complaint, 'find', () => ({
      select() {
        return this;
      },
      sort() {
        return Promise.resolve([]);
      },
    }));
    const res = mockRes();
    await getPendingVerificationComplaints({ user: monitor }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(find.mock.calls[0].arguments[0], { status: STATUS.PENDING_VERIFICATION });
  });
});

describe('SLA and escalation with verification', () => {
  it('rework deadline is 24 hours from the rejection time', () => {
    const from = new Date('2026-10-16T10:00:00Z');
    assert.equal(calculateReworkDueAt(from).toISOString(), '2026-10-17T10:00:00.000Z');
  });

  it('the escalation scheduler only considers submitted complaints', async () => {
    const find = mock.method(Complaint, 'find', async () => []);
    await runEscalationCheck();
    const filter = find.mock.calls[0].arguments[0];
    // Must be an exact match, not "not resolved", which would include pending_verification.
    assert.equal(filter.status, STATUS.SUBMITTED);
  });

  it('the escalation update is guarded to submitted, so a pending complaint is never escalated', async () => {
    const overdue = complaintFixture({ user: 'citizen-1', dueAt: new Date(Date.now() - HOUR_MS) });
    mock.method(Complaint, 'find', async () => [overdue]);
    mock.method(User, 'find', async () => []);
    const updateOne = mock.method(Complaint, 'updateOne', async () => ({ modifiedCount: 0 }));

    await runEscalationCheck();

    const guard = updateOne.mock.calls[0].arguments[0];
    assert.equal(guard.status, STATUS.SUBMITTED);
  });

  it('an overdue submitted complaint (including a reworked one) is escalated', async () => {
    const overdue = complaintFixture({ user: 'citizen-1', dueAt: new Date(Date.now() - HOUR_MS) });
    mock.method(Complaint, 'find', async () => [overdue]);
    mock.method(User, 'find', async () => []);
    const updateOne = mock.method(Complaint, 'updateOne', async () => ({ modifiedCount: 1 }));

    const summary = await runEscalationCheck();

    assert.equal(summary.escalated, 1);
    assert.equal(updateOne.mock.calls[0].arguments[0].status, STATUS.SUBMITTED);
    assert.equal(notificationCreate.mock.calls[0].arguments[0].type, 'complaint_escalated');
  });
});

describe('department work status', () => {
  const notStarted = () => complaintFixture({ workStatus: WORK_STATUS.NOT_STARTED });
  const inProgress = () => complaintFixture({ workStatus: WORK_STATUS.IN_PROGRESS });

  it('lists the work statuses', () => {
    assert.deepEqual(WORK_STATUSES, ['not_started', 'in_progress']);
  });

  it('model accepts in_progress and work_started history, and rejects unknown work statuses', async () => {
    const actor = '64b000000000000000000001';
    const ok = new Complaint({
      user: actor,
      description: 'x',
      workStatus: 'in_progress',
      verificationHistory: [{ action: 'work_started', actor, at: new Date() }],
    });
    await ok.validate();

    const bad = new Complaint({ user: actor, description: 'x', workStatus: 'done' });
    await assert.rejects(bad.validate(), (error) => error.errors.workStatus !== undefined);
  });

  it('marks a submitted, not-started complaint in progress without changing its status', async () => {
    mock.method(Complaint, 'findOne', async () => notStarted());
    const update = mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({
      ...notStarted(),
      ...body.$set,
    }));

    const res = mockRes();
    await updateDepartmentWorkStatus(
      { user: authority, params: { id: 'c-1' }, body: { workStatus: 'in_progress' } },
      res
    );

    assert.equal(res.statusCode, 200);
    const [filter, body] = update.mock.calls[0].arguments;
    assert.equal(filter.status, STATUS.SUBMITTED, 'update must be guarded by status');
    assert.deepEqual(filter.workStatus, { $ne: WORK_STATUS.IN_PROGRESS }, 'update must be guarded against a repeat start');
    assert.equal(filter.department, authority.department, 'update must be scoped to the department');
    assert.equal(body.$set.workStatus, WORK_STATUS.IN_PROGRESS);
    assert.ok(body.$set.workStartedAt instanceof Date);
    assert.equal('status' in body.$set, false, 'work status must never change the complaint status');
    assert.equal(body.$push.verificationHistory.action, 'work_started');
    assert.equal(body.$push.verificationHistory.actor, authority.id);
  });

  it('only finds complaints in the requesting department, so another department gets 404', async () => {
    const find = mock.method(Complaint, 'findOne', async () => null);
    const update = mock.method(Complaint, 'findOneAndUpdate', async () => null);

    const res = mockRes();
    await updateDepartmentWorkStatus(
      { user: authority, params: { id: 'c-9' }, body: { workStatus: 'in_progress' } },
      res
    );

    assert.equal(res.statusCode, 404);
    assert.equal(find.mock.calls[0].arguments[0].department, authority.department);
    assert.equal(update.mock.callCount(), 0);
  });

  it('refuses a department account with no department, before any lookup', async () => {
    const find = mock.method(Complaint, 'findOne', async () => notStarted());

    const res = mockRes();
    await updateDepartmentWorkStatus(
      { user: { id: 'auth-2', role: 'department' }, params: { id: 'c-1' }, body: { workStatus: 'in_progress' } },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.equal(find.mock.callCount(), 0);
  });

  it('accepts only in_progress, so no other value can change status or work status', async () => {
    for (const workStatus of ['resolved', 'submitted', 'not_started', 'pending_verification', undefined]) {
      const find = mock.method(Complaint, 'findOne', async () => notStarted());
      const res = mockRes();
      await updateDepartmentWorkStatus({ user: authority, params: { id: 'c-1' }, body: { workStatus } }, res);
      assert.equal(res.statusCode, 400, `${workStatus} must be rejected`);
      assert.equal(find.mock.callCount(), 0, 'invalid work status must be rejected before any lookup');
      mock.restoreAll();
    }
  });

  it('refuses to start work on a complaint that is not submitted, without writing', async () => {
    for (const status of [STATUS.PENDING_VERIFICATION, STATUS.RESOLVED, STATUS.NEEDS_CONFIRMATION]) {
      mock.method(Complaint, 'findOne', async () => complaintFixture({ status }));
      const update = mock.method(Complaint, 'findOneAndUpdate', async () => null);
      const res = mockRes();
      await updateDepartmentWorkStatus({ user: authority, params: { id: 'c-1' }, body: { workStatus: 'in_progress' } }, res);
      assert.equal(res.statusCode, 409, `work must not start for status ${status}`);
      assert.equal(update.mock.callCount(), 0);
      mock.restoreAll();
    }
  });

  it('refuses a repeat start on a complaint already in progress, without writing', async () => {
    mock.method(Complaint, 'findOne', async () => inProgress());
    const update = mock.method(Complaint, 'findOneAndUpdate', async () => null);

    const res = mockRes();
    await updateDepartmentWorkStatus({ user: authority, params: { id: 'c-1' }, body: { workStatus: 'in_progress' } }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(update.mock.callCount(), 0);
  });

  it('submitting for verification still works without starting work, and leaves work status alone', async () => {
    mock.method(Complaint, 'findOne', async () => notStarted());
    const update = mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({ ...notStarted(), ...body.$set }));

    const res = mockRes();
    await updateDepartmentComplaintStatus({ user: authority, params: { id: 'c-1' }, body: { status: 'resolved' } }, res);

    assert.equal(res.statusCode, 200);
    const body = update.mock.calls[0].arguments[1];
    assert.equal(body.$set.status, STATUS.PENDING_VERIFICATION);
    assert.equal('workStatus' in body.$set, false);
  });

  it('a monitor rejection returns the complaint to in progress for rework', async () => {
    mock.method(Complaint, 'findOne', async () => complaintFixture({ status: STATUS.PENDING_VERIFICATION }));
    const update = mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({ ...complaintFixture(), ...body.$set }));

    const res = mockRes();
    await reviewCompletion({ user: monitor, params: { id: 'c-1' }, body: { decision: 'reject', reason: 'Still broken' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(update.mock.calls[0].arguments[1].$set.workStatus, WORK_STATUS.IN_PROGRESS);
  });

  it('an overdue complaint in progress is still escalated, because escalation looks only at status', async () => {
    const overdue = inProgress();
    overdue.dueAt = new Date(Date.now() - HOUR_MS);
    mock.method(Complaint, 'find', async () => [overdue]);
    mock.method(User, 'find', async () => []);
    const updateOne = mock.method(Complaint, 'updateOne', async () => ({ modifiedCount: 1 }));

    const summary = await runEscalationCheck();

    assert.equal(summary.escalated, 1);
    assert.equal(updateOne.mock.calls[0].arguments[0].status, STATUS.SUBMITTED);
    assert.equal('workStatus' in updateOne.mock.calls[0].arguments[0], false);
  });
});

describe('work started notification to the citizen', () => {
  const notStarted = () => complaintFixture({ workStatus: WORK_STATUS.NOT_STARTED });
  const inProgress = () => complaintFixture({ workStatus: WORK_STATUS.IN_PROGRESS });
  const startWork = () =>
    updateDepartmentWorkStatus({ user: authority, params: { id: 'c-1' }, body: { workStatus: 'in_progress' } }, mockRes());

  it('notifies only the citizen who submitted the complaint, after the status is saved', async () => {
    mock.method(Complaint, 'findOne', async () => notStarted());
    mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({ ...notStarted(), ...body.$set }));

    const res = mockRes();
    await updateDepartmentWorkStatus({ user: authority, params: { id: 'c-1' }, body: { workStatus: 'in_progress' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(notificationCreate.mock.callCount(), 1);
    const notification = notificationCreate.mock.calls[0].arguments[0];
    assert.equal(notification.user, 'citizen-1', 'the notification goes to the complaint owner');
    assert.notEqual(notification.user, authority.id, 'never to the department user');
    assert.equal(notification.type, 'complaint_work_started');
    assert.equal(notification.complaint, 'c-1');
  });

  it('sends nothing when the update is refused for a complaint outside the department', async () => {
    mock.method(Complaint, 'findOne', async () => null);
    const update = mock.method(Complaint, 'findOneAndUpdate', async () => null);

    const res = mockRes();
    await updateDepartmentWorkStatus({ user: authority, params: { id: 'c-9' }, body: { workStatus: 'in_progress' } }, res);

    assert.equal(res.statusCode, 404);
    assert.equal(update.mock.callCount(), 0);
    assert.equal(notificationCreate.mock.callCount(), 0);
  });

  it('sends nothing for a department account with no department, or an invalid work status', async () => {
    mock.method(Complaint, 'findOne', async () => notStarted());

    await updateDepartmentWorkStatus(
      { user: { id: 'auth-2', role: 'department' }, params: { id: 'c-1' }, body: { workStatus: 'in_progress' } },
      mockRes()
    );
    await updateDepartmentWorkStatus({ user: authority, params: { id: 'c-1' }, body: { workStatus: 'resolved' } }, mockRes());

    assert.equal(notificationCreate.mock.callCount(), 0);
  });

  it('sends nothing when the complaint is not submitted', async () => {
    mock.method(Complaint, 'findOne', async () => complaintFixture({ status: STATUS.PENDING_VERIFICATION }));
    mock.method(Complaint, 'findOneAndUpdate', async () => null);

    const res = mockRes();
    await updateDepartmentWorkStatus({ user: authority, params: { id: 'c-1' }, body: { workStatus: 'in_progress' } }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(notificationCreate.mock.callCount(), 0);
  });

  it('a repeated start request is refused and sends no second notification', async () => {
    const stored = { current: notStarted() };
    mock.method(Complaint, 'findOne', async () => stored.current);
    mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => {
      stored.current = { ...stored.current, ...body.$set };
      return stored.current;
    });

    const first = mockRes();
    await updateDepartmentWorkStatus({ user: authority, params: { id: 'c-1' }, body: { workStatus: 'in_progress' } }, first);
    const second = mockRes();
    await updateDepartmentWorkStatus({ user: authority, params: { id: 'c-1' }, body: { workStatus: 'in_progress' } }, second);

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 409);
    assert.equal(notificationCreate.mock.callCount(), 1, 'exactly one notification across both requests');
  });

  it('a concurrent start that loses the race sends no notification', async () => {
    mock.method(Complaint, 'findOne', async () => notStarted());
    mock.method(Complaint, 'findOneAndUpdate', async () => null);

    const res = mockRes();
    await updateDepartmentWorkStatus({ user: authority, params: { id: 'c-1' }, body: { workStatus: 'in_progress' } }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(notificationCreate.mock.callCount(), 0);
  });

  it('a failed notification write does not roll back or fail the status update', async () => {
    const silence = mock.method(console, 'error', () => {});
    mock.method(Complaint, 'findOne', async () => notStarted());
    const update = mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({ ...notStarted(), ...body.$set }));
    notificationCreate.mock.mockImplementation(async () => {
      throw new Error('database unavailable');
    });

    const res = mockRes();
    await updateDepartmentWorkStatus({ user: authority, params: { id: 'c-1' }, body: { workStatus: 'in_progress' } }, res);

    assert.equal(res.statusCode, 200, 'the caller still gets success');
    assert.equal(update.mock.callCount(), 1, 'the status update was written once and not reverted');
    assert.equal(res.body.complaint.workStatus, WORK_STATUS.IN_PROGRESS);
    assert.equal(silence.mock.callCount(), 1, 'the failure is logged');
  });

  it('a duplicate-key notification (already notified) is treated as success', async () => {
    mock.method(Complaint, 'findOne', async () => notStarted());
    mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({ ...notStarted(), ...body.$set }));
    notificationCreate.mock.mockImplementation(async () => {
      const error = new Error('E11000 duplicate key');
      error.code = 11000;
      throw error;
    });

    const res = mockRes();
    await updateDepartmentWorkStatus({ user: authority, params: { id: 'c-1' }, body: { workStatus: 'in_progress' } }, res);

    assert.equal(res.statusCode, 200);
  });
});

describe('monitor decision notifications to the citizen', () => {
  const pending = (overrides = {}) => complaintFixture({ status: STATUS.PENDING_VERIFICATION, ...overrides });
  const priorRejection = { action: 'rejected', actor: 'mon-0', at: new Date(), reason: 'Earlier' };
  const review = async (decision, reason) => {
    const res = mockRes();
    await reviewCompletion({ user: monitor, params: { id: 'c-1' }, body: { decision, reason } }, res);
    return res;
  };

  it('approval tells the citizen the complaint was verified and resolved, and only the citizen is notified', async () => {
    mock.method(Complaint, 'findOne', async () => pending());
    mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({ ...pending(), ...body.$set }));

    const res = mockRes();
    await review('approve');

    assert.equal(res.statusCode, 200);
    assert.equal(notificationCreate.mock.callCount(), 1);
    const notification = notificationCreate.mock.calls[0].arguments[0];
    assert.equal(notification.type, 'complaint_resolved');
    assert.equal(notification.user, 'citizen-1');
    assert.notEqual(notification.user, monitor.id);
    assert.match(notification.message, /verified by a monitor and marked as resolved/);
    assert.equal(notification.complaint, 'c-1');
  });

  it('rejection tells the citizen verification failed, includes the trimmed reason, and numbers the round', async () => {
    mock.method(Complaint, 'findOne', async () => pending());
    mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({ ...pending(), ...body.$set }));

    await review('reject', '  Pothole still open  ');

    assert.equal(notificationCreate.mock.callCount(), 1);
    const notification = notificationCreate.mock.calls[0].arguments[0];
    assert.equal(notification.type, 'complaint_verification_failed');
    assert.equal(notification.user, 'citizen-1');
    assert.match(notification.message, /Reason: Pothole still open$/);
    assert.equal(notification.verificationRound, 1);
  });

  it('a second rejection in a later rework cycle gets round 2, so it is not blocked as a duplicate', async () => {
    mock.method(Complaint, 'findOne', async () => pending({ verificationHistory: [priorRejection] }));
    mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({ ...pending(), ...body.$set }));

    await review('reject', 'Still not fixed');

    assert.equal(notificationCreate.mock.calls[0].arguments[0].verificationRound, 2);
  });

  it('a repeated decision is refused and sends no second notification', async () => {
    const stored = { current: pending() };
    mock.method(Complaint, 'findOne', async () => stored.current);
    mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => {
      if (stored.current.status !== STATUS.PENDING_VERIFICATION) return null;
      stored.current = { ...stored.current, ...body.$set };
      return stored.current;
    });

    const first = mockRes();
    await reviewCompletion({ user: monitor, params: { id: 'c-1' }, body: { decision: 'approve' } }, first);
    const second = mockRes();
    await reviewCompletion({ user: monitor, params: { id: 'c-1' }, body: { decision: 'approve' } }, second);

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 409);
    assert.equal(notificationCreate.mock.callCount(), 1);
  });

  it('a losing concurrent decision sends no notification', async () => {
    mock.method(Complaint, 'findOne', async () => pending());
    mock.method(Complaint, 'findOneAndUpdate', async () => null);

    const res = await review('reject', 'Late decision');

    assert.equal(res.statusCode, 409);
    assert.equal(notificationCreate.mock.callCount(), 0);
  });

  it('refused decisions (missing reason, wrong status) send no notification', async () => {
    mock.method(Complaint, 'findOne', async () => pending());
    await review('reject', '   ');
    assert.equal(notificationCreate.mock.callCount(), 0);

    mock.restoreAll();
    notificationCreate = mock.method(Notification, 'create', async () => ({}));
    mock.method(Complaint, 'findOne', async () => complaintFixture({ status: STATUS.SUBMITTED }));
    mock.method(Complaint, 'findOneAndUpdate', async () => null);
    await review('approve');
    assert.equal(notificationCreate.mock.callCount(), 0);
  });

  it('a failed notification does not undo an approval or rejection', async () => {
    const silence = mock.method(console, 'error', () => {});
    mock.method(Complaint, 'findOne', async () => pending());
    const update = mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({ ...pending(), ...body.$set }));
    notificationCreate.mock.mockImplementation(async () => {
      throw new Error('database unavailable');
    });

    const approve = mockRes();
    await reviewCompletion({ user: monitor, params: { id: 'c-1' }, body: { decision: 'approve' } }, approve);
    const reject = mockRes();
    await review('reject', 'Still open');

    assert.equal(approve.statusCode, 200);
    assert.equal(approve.body.complaint.status, STATUS.RESOLVED);
    assert.equal(reject.statusCode, 200);
    assert.equal(update.mock.callCount(), 2);
    assert.equal(silence.mock.callCount(), 2, 'both failures are logged');
  });

  it('a duplicate-key notification is treated as success', async () => {
    mock.method(Complaint, 'findOne', async () => pending());
    mock.method(Complaint, 'findOneAndUpdate', async (filter, body) => ({ ...pending(), ...body.$set }));
    notificationCreate.mock.mockImplementation(async () => {
      const error = new Error('E11000 duplicate key');
      error.code = 11000;
      throw error;
    });

    const res = mockRes();
    await review('reject', 'Still open');

    assert.equal(res.statusCode, 200);
  });

  it('the notification index is unique per user, complaint, type and verification round', () => {
    const index = Notification.schema.indexes().find(([fields]) => fields.verificationRound === 1);
    assert.ok(index, 'index must include verificationRound');
    assert.equal(index[0].user, 1);
    assert.equal(index[0].complaint, 1);
    assert.equal(index[0].type, 1);
    assert.equal(index[1].unique, true);
  });
});
