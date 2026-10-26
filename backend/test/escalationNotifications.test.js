/**
 * Tests for overdue escalation notifications, duplicate prevention, the
 * escalation level progression, and escalation failures.
 *
 * Uses node:test with Model methods stubbed, so no MongoDB is needed.
 * Run with: npm test (from backend/).
 */

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');

const Complaint = require('../models/Complaint');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { runEscalationCheck } = require('../services/escalationService');
const {
  ESCALATION_LEVELS,
  validateEscalationLevels,
  getNextEscalation,
  getMaxEscalationLevel,
} = require('../services/escalationLevels');
const {
  notifyEscalation,
  formatOverdueDuration,
  NOTIFICATION_TYPE,
  CITIZEN_MESSAGE,
} = require('../services/escalationNotifications');

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date('2026-10-18T12:00:00Z');
const ONE_LEVEL = [{ level: 1, hoursAfterDue: 0 }];
const TWO_LEVELS = [
  { level: 1, hoursAfterDue: 0 },
  { level: 2, hoursAfterDue: 24 },
];

// Accounts in the database. The User.find stub filters them the way Mongoose
// would, so tests can check that unrelated departments are not notified.
const USERS = [
  { _id: 'dept-road-1', role: 'department', department: 'Road Department' },
  { _id: 'dept-road-2', role: 'department', department: 'Road Department' },
  { _id: 'dept-water-1', role: 'department', department: 'Water Department' },
  { _id: 'mon-1', role: 'monitor' },
  { _id: 'mon-2', role: 'monitor' },
];

const complaintFixture = (overrides = {}) => ({
  _id: 'c-1',
  user: 'citizen-1',
  issueType: 'pothole',
  department: 'Road Department',
  status: 'submitted',
  dueAt: new Date(NOW.getTime() - 2 * HOUR_MS),
  escalationLevel: 0,
  location: { address: 'MG Road near the bus stop' },
  ...overrides,
});

let consoleMocks;
let createdNotifications;
let calls;

const stubUserFind = (users = USERS) =>
  mock.method(User, 'find', async (filter) =>
    users.filter((user) => {
      if (filter.role !== undefined && user.role !== filter.role) return false;
      if (filter.department !== undefined && user.department !== filter.department) return false;
      return true;
    })
  );

beforeEach(() => {
  createdNotifications = [];
  calls = [];
  consoleMocks = {
    error: mock.method(console, 'error', () => {}),
    warn: mock.method(console, 'warn', () => {}),
    log: mock.method(console, 'log', () => {}),
  };
  mock.method(Notification, 'create', async (doc) => {
    calls.push('notify');
    createdNotifications.push(doc);
    return doc;
  });
});

afterEach(() => {
  mock.restoreAll();
});

describe('escalation level configuration', () => {
  it('defaults to a single level that is due at the SLA deadline, as before', () => {
    assert.deepEqual(ESCALATION_LEVELS, ONE_LEVEL);
    assert.equal(getMaxEscalationLevel(), 1);
  });

  it('accepts a valid multi-level progression', () => {
    assert.deepEqual(validateEscalationLevels(TWO_LEVELS), TWO_LEVELS);
  });

  it('rejects an empty table, bad numbering, bad offsets, and offsets that do not increase', () => {
    assert.throws(() => validateEscalationLevels([]), /non-empty/);
    assert.throws(() => validateEscalationLevels([{ level: 2, hoursAfterDue: 0 }]), /must be numbered 1/);
    assert.throws(() => validateEscalationLevels([{ level: 1, hoursAfterDue: -1 }]), /hoursAfterDue of 0 or more/);
    assert.throws(() => validateEscalationLevels([{ level: 1, hoursAfterDue: NaN }]), /hoursAfterDue of 0 or more/);
    assert.throws(
      () =>
        validateEscalationLevels([
          { level: 1, hoursAfterDue: 10 },
          { level: 2, hoursAfterDue: 10 },
        ]),
      /must increase/
    );
  });
});

describe('getNextEscalation', () => {
  it('returns null when the complaint has no deadline', () => {
    assert.equal(getNextEscalation(complaintFixture({ dueAt: undefined }), NOW), null);
  });

  it('returns level 1 once the deadline has passed, and not before', () => {
    const notYet = complaintFixture({ dueAt: new Date(NOW.getTime() + HOUR_MS) });
    assert.equal(getNextEscalation(notYet, NOW), null);
    assert.deepEqual(getNextEscalation(complaintFixture(), NOW), { level: 1, hoursAfterDue: 0 });
  });

  it('returns null once the last level is reached, so escalation has a limit', () => {
    assert.equal(getNextEscalation(complaintFixture({ escalationLevel: 1 }), NOW), null);
  });

  it('moves one level at a time, and level 2 waits for its own offset', () => {
    const atLevel1 = complaintFixture({ escalationLevel: 1, dueAt: new Date(NOW.getTime() - 2 * HOUR_MS) });
    assert.equal(getNextEscalation(atLevel1, NOW, TWO_LEVELS), null);

    const dueForLevel2 = complaintFixture({ escalationLevel: 1, dueAt: new Date(NOW.getTime() - 25 * HOUR_MS) });
    assert.deepEqual(getNextEscalation(dueForLevel2, NOW, TWO_LEVELS), { level: 2, hoursAfterDue: 24 });
  });

  it('treats a document saved before escalationLevel existed as level 0', () => {
    const legacy = complaintFixture();
    delete legacy.escalationLevel;
    assert.deepEqual(getNextEscalation(legacy, NOW), { level: 1, hoursAfterDue: 0 });
  });
});

describe('formatOverdueDuration', () => {
  it('formats minutes, hours, and days', () => {
    assert.equal(formatOverdueDuration(45 * 60 * 1000), '45 min');
    assert.equal(formatOverdueDuration(2 * HOUR_MS + 15 * 60 * 1000), '2 h 15 min');
    assert.equal(formatOverdueDuration(49 * HOUR_MS), '2 d 1 h');
    assert.equal(formatOverdueDuration(-5), '0 min');
  });
});

describe('escalation notifications: recipients and content', () => {
  const step = { level: 1, hoursAfterDue: 0 };

  it('notifies the citizen, the matching department accounts, and every monitor, and no other department', async () => {
    const find = stubUserFind();

    const delivered = await notifyEscalation(complaintFixture(), step, NOW);

    assert.equal(delivered, true);
    const recipients = createdNotifications.map((doc) => doc.user).sort();
    assert.deepEqual(recipients, ['citizen-1', 'dept-road-1', 'dept-road-2', 'mon-1', 'mon-2'].sort());
    assert.equal(recipients.includes('dept-water-1'), false);

    const departmentFilter = find.mock.calls.find((c) => c.arguments[0].role === 'department').arguments[0];
    assert.deepEqual(departmentFilter, { role: 'department', department: 'Road Department' });
  });

  it('keeps the citizen message unchanged, and gives each recipient the same type, complaint and level', async () => {
    stubUserFind();

    await notifyEscalation(complaintFixture(), step, NOW);

    const citizen = createdNotifications.find((doc) => doc.user === 'citizen-1');
    assert.equal(citizen.message, CITIZEN_MESSAGE);
    assert.equal(citizen.title, 'Complaint Escalated');
    for (const doc of createdNotifications) {
      assert.equal(doc.type, NOTIFICATION_TYPE);
      assert.equal(doc.complaint, 'c-1');
      assert.equal(doc.escalationLevel, 1);
    }
  });

  it('gives department and monitor messages the complaint id, category, location, overdue duration and level', async () => {
    stubUserFind();

    await notifyEscalation(complaintFixture(), step, NOW);

    const department = createdNotifications.find((doc) => doc.user === 'dept-road-1');
    assert.match(department.message, /Complaint c-1 \(Pothole\)/);
    assert.match(department.message, /at MG Road near the bus stop/);
    assert.match(department.message, /2 h 0 min past its SLA deadline/);
    assert.match(department.message, /escalated to level 1/);

    const monitor = createdNotifications.find((doc) => doc.user === 'mon-1');
    assert.match(monitor.message, /verification queue/);
  });

  it('falls back to coordinates, then to "location not provided"', async () => {
    stubUserFind();

    await notifyEscalation(complaintFixture({ location: { latitude: 12.97, longitude: 77.59 } }), step, NOW);
    assert.match(createdNotifications.find((doc) => doc.user === 'dept-road-1').message, /at 12\.97000, 77\.59000/);

    createdNotifications = [];
    await notifyEscalation(complaintFixture({ location: undefined }), step, NOW);
    assert.match(createdNotifications.find((doc) => doc.user === 'dept-road-1').message, /at location not provided/);
  });

  it('never queries departments with an undefined value, so a complaint with no department notifies no department account', async () => {
    const find = stubUserFind();

    const delivered = await notifyEscalation(complaintFixture({ department: undefined }), step, NOW);

    assert.equal(delivered, true);
    const departmentCalls = find.mock.calls.filter((c) => c.arguments[0].role === 'department');
    assert.equal(departmentCalls.length, 0);
    const recipients = createdNotifications.map((doc) => doc.user);
    assert.equal(recipients.some((id) => id.startsWith('dept-')), false);
    assert.deepEqual(recipients.sort(), ['citizen-1', 'mon-1', 'mon-2']);
  });

  it('missing department accounts: the citizen and monitors are still notified, and a warning is logged', async () => {
    stubUserFind([{ _id: 'mon-1', role: 'monitor' }]);

    const delivered = await notifyEscalation(complaintFixture(), step, NOW);

    assert.equal(delivered, true);
    assert.deepEqual(createdNotifications.map((doc) => doc.user).sort(), ['citizen-1', 'mon-1']);
    assert.equal(consoleMocks.warn.mock.callCount(), 1);
    assert.match(consoleMocks.warn.mock.calls[0].arguments[0], /No department accounts found for "Road Department"/);
  });

  it('no monitor accounts: department and citizen are still notified, and a warning is logged', async () => {
    stubUserFind([{ _id: 'dept-road-1', role: 'department', department: 'Road Department' }]);

    const delivered = await notifyEscalation(complaintFixture(), step, NOW);

    assert.equal(delivered, true);
    assert.deepEqual(createdNotifications.map((doc) => doc.user).sort(), ['citizen-1', 'dept-road-1']);
    assert.match(consoleMocks.warn.mock.calls[0].arguments[0], /No monitor accounts found/);
  });

  it('a duplicate-key error (already notified) counts as delivered, so a repeat is not a failure', async () => {
    stubUserFind();
    mock.method(Notification, 'create', async () => {
      const error = new Error('E11000 duplicate key');
      error.code = 11000;
      throw error;
    });

    assert.equal(await notifyEscalation(complaintFixture(), step, NOW), true);
  });

  it('a notification that cannot be saved makes the result false, without throwing', async () => {
    stubUserFind();
    mock.method(Notification, 'create', async (doc) => {
      if (doc.user === 'dept-road-2') throw new Error('write failed');
      return doc;
    });

    assert.equal(await notifyEscalation(complaintFixture(), step, NOW), false);
  });

  it('a failed recipient lookup makes the result false, without throwing', async () => {
    mock.method(User, 'find', async () => {
      throw new Error('database unavailable');
    });

    assert.equal(await notifyEscalation(complaintFixture(), step, NOW), false);
    assert.equal(createdNotifications.length, 0);
  });
});

describe('escalation check: notify, then advance', () => {
  it('notifies everyone, then advances the complaint to the new level, in that order', async () => {
    mock.method(Complaint, 'find', async () => [complaintFixture()]);
    stubUserFind();
    const updateOne = mock.method(Complaint, 'updateOne', async () => {
      calls.push('advance');
      return { modifiedCount: 1 };
    });

    const summary = await runEscalationCheck({ now: NOW });

    assert.deepEqual(summary, { checked: 1, escalated: 1, failed: 0 });
    assert.equal(calls[0], 'notify');
    assert.equal(calls[calls.length - 1], 'advance');

    const [guard, update] = updateOne.mock.calls[0].arguments;
    assert.equal(guard._id, 'c-1');
    assert.equal(guard.status, 'submitted');
    assert.equal(guard.escalationLevel.$in.includes(0), true);
    assert.deepEqual(guard.dueAt, complaintFixture().dueAt);
    assert.equal(update.$set.escalationLevel, 1);
    assert.equal(update.$set.escalatedAt.getTime(), NOW.getTime());
  });

  it('a complaint saved before escalationLevel existed is still guarded and advanced', async () => {
    const legacy = complaintFixture();
    delete legacy.escalationLevel;
    mock.method(Complaint, 'find', async () => [legacy]);
    stubUserFind();
    const updateOne = mock.method(Complaint, 'updateOne', async () => ({ modifiedCount: 1 }));

    const summary = await runEscalationCheck({ now: NOW });

    assert.equal(summary.escalated, 1);
    assert.deepEqual(updateOne.mock.calls[0].arguments[0].escalationLevel, { $in: [0, null] });
  });

  it('only queries submitted complaints, below the last level, that are past their deadline', async () => {
    const find = mock.method(Complaint, 'find', async () => []);

    await runEscalationCheck({ now: NOW, levels: TWO_LEVELS });

    const filter = find.mock.calls[0].arguments[0];
    assert.equal(filter.status, 'submitted');
    assert.deepEqual(filter.dueAt, { $lte: NOW });
    assert.deepEqual(filter.escalationLevel, { $not: { $gte: 2 } });
  });

  it('a complaint returned by the query but not yet due is skipped, with no notification or write', async () => {
    mock.method(Complaint, 'find', async () => [complaintFixture({ dueAt: new Date(NOW.getTime() + HOUR_MS) })]);
    const updateOne = mock.method(Complaint, 'updateOne', async () => ({ modifiedCount: 1 }));

    const summary = await runEscalationCheck({ now: NOW });

    assert.deepEqual(summary, { checked: 1, escalated: 0, failed: 0 });
    assert.equal(updateOne.mock.callCount(), 0);
    assert.equal(createdNotifications.length, 0);
  });
});

describe('escalation check: repeated runs and restarts', () => {
  it('a second run after the first escalation sends no new notifications and changes nothing', async () => {
    // First run: the complaint is still at level 0 and is escalated.
    mock.method(Complaint, 'find', async () => [complaintFixture()]);
    stubUserFind();
    mock.method(Complaint, 'updateOne', async () => ({ modifiedCount: 1 }));
    const first = await runEscalationCheck({ now: NOW });
    assert.equal(first.escalated, 1);
    const firstCount = createdNotifications.length;

    // Second run (or a run after a restart): the stored level is now 1, so the
    // complaint is no longer a candidate and nothing new is sent.
    mock.method(Complaint, 'find', async () => []);
    const second = await runEscalationCheck({ now: NOW });

    assert.deepEqual(second, { checked: 0, escalated: 0, failed: 0 });
    assert.equal(createdNotifications.length, firstCount);
  });

  it('an overlapping run that finds the complaint still at level 0 creates no duplicate and does not count as escalated', async () => {
    mock.method(Complaint, 'find', async () => [complaintFixture()]);
    stubUserFind();
    // Every notification already exists from the other run, and the level was
    // already advanced by it, so this run's guarded write matches nothing.
    mock.method(Notification, 'create', async () => {
      const error = new Error('E11000 duplicate key');
      error.code = 11000;
      throw error;
    });
    mock.method(Complaint, 'updateOne', async () => ({ modifiedCount: 0 }));

    const summary = await runEscalationCheck({ now: NOW });

    assert.deepEqual(summary, { checked: 1, escalated: 0, failed: 0 });
  });

  it('after a level is reached, the next level is only due once its own time has passed', async () => {
    const atLevel1 = complaintFixture({ escalationLevel: 1, dueAt: new Date(NOW.getTime() - 2 * HOUR_MS) });
    mock.method(Complaint, 'find', async () => [atLevel1]);
    const updateOne = mock.method(Complaint, 'updateOne', async () => ({ modifiedCount: 1 }));

    const summary = await runEscalationCheck({ now: NOW, levels: TWO_LEVELS });

    assert.deepEqual(summary, { checked: 1, escalated: 0, failed: 0 });
    assert.equal(updateOne.mock.callCount(), 0);
  });
});

describe('escalation check: progression with a second level', () => {
  it('moves a complaint up one level per check, not straight to the last level', async () => {
    mock.method(Complaint, 'find', async () => [complaintFixture({ dueAt: new Date(NOW.getTime() - 30 * HOUR_MS) })]);
    stubUserFind();
    const updateOne = mock.method(Complaint, 'updateOne', async () => ({ modifiedCount: 1 }));

    await runEscalationCheck({ now: NOW, levels: TWO_LEVELS });

    assert.equal(updateOne.mock.calls[0].arguments[1].$set.escalationLevel, 1);
  });

  it('escalates to level 2 once level 2 is due, and the guard requires the current level 1', async () => {
    mock.method(Complaint, 'find', async () => [
      complaintFixture({ escalationLevel: 1, dueAt: new Date(NOW.getTime() - 25 * HOUR_MS) }),
    ]);
    stubUserFind();
    const updateOne = mock.method(Complaint, 'updateOne', async () => ({ modifiedCount: 1 }));

    const summary = await runEscalationCheck({ now: NOW, levels: TWO_LEVELS });

    assert.equal(summary.escalated, 1);
    assert.equal(updateOne.mock.calls[0].arguments[0].escalationLevel, 1);
    assert.equal(updateOne.mock.calls[0].arguments[1].$set.escalationLevel, 2);
    assert.equal(createdNotifications.find((doc) => doc.user === 'dept-road-1').escalationLevel, 2);
    assert.match(createdNotifications.find((doc) => doc.user === 'dept-road-1').message, /escalated to level 2/);
  });
});

describe('escalation check: failures', () => {
  it('a failed query returns zero counts and writes nothing', async () => {
    mock.method(Complaint, 'find', async () => {
      throw new Error('connection lost');
    });
    const updateOne = mock.method(Complaint, 'updateOne', async () => ({ modifiedCount: 1 }));

    const summary = await runEscalationCheck({ now: NOW });

    assert.deepEqual(summary, { checked: 0, escalated: 0, failed: 0 });
    assert.equal(updateOne.mock.callCount(), 0);
    assert.equal(consoleMocks.error.mock.callCount(), 1);
  });

  it('a notification that cannot be saved leaves the level unchanged, so the next run retries', async () => {
    mock.method(Complaint, 'find', async () => [complaintFixture()]);
    stubUserFind();
    mock.method(Notification, 'create', async () => {
      throw new Error('write failed');
    });
    const updateOne = mock.method(Complaint, 'updateOne', async () => ({ modifiedCount: 1 }));

    const summary = await runEscalationCheck({ now: NOW });

    assert.deepEqual(summary, { checked: 1, escalated: 0, failed: 1 });
    assert.equal(updateOne.mock.callCount(), 0);
  });

  it('a failed level write for one complaint does not stop the rest of the batch', async () => {
    mock.method(Complaint, 'find', async () => [complaintFixture({ _id: 'c-bad' }), complaintFixture({ _id: 'c-good' })]);
    stubUserFind();
    mock.method(Complaint, 'updateOne', async (filter) => {
      if (filter._id === 'c-bad') throw new Error('write timed out');
      return { modifiedCount: 1 };
    });

    const summary = await runEscalationCheck({ now: NOW });

    assert.deepEqual(summary, { checked: 2, escalated: 1, failed: 1 });
    assert.ok(createdNotifications.some((doc) => doc.user === 'dept-road-1'));
  });

  it('a complaint with no recipients at all still escalates, because the level is the record of the breach', async () => {
    mock.method(Complaint, 'find', async () => [complaintFixture()]);
    stubUserFind([]);
    const updateOne = mock.method(Complaint, 'updateOne', async () => ({ modifiedCount: 1 }));

    const summary = await runEscalationCheck({ now: NOW });

    assert.deepEqual(summary, { checked: 1, escalated: 1, failed: 0 });
    assert.equal(updateOne.mock.callCount(), 1);
    assert.deepEqual(createdNotifications.map((doc) => doc.user), ['citizen-1']);
  });
});

describe('notification index covers each recipient and escalation level', () => {
  it('is unique per user, complaint, type, verification round and escalation level', () => {
    const index = Notification.schema.indexes().find(([fields]) => fields.escalationLevel === 1);
    assert.ok(index, 'index must include escalationLevel');
    assert.equal(index[0].user, 1);
    assert.equal(index[0].complaint, 1);
    assert.equal(index[0].type, 1);
    assert.equal(index[0].verificationRound, 1);
    assert.equal(index[1].unique, true);
  });
});
