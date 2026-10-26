const User = require('../models/User');
const { createNotification } = require('./notificationService');

/**
 * Recipients and message text for escalation notifications.
 *
 * Who is notified when a complaint is escalated to a level:
 *   - the citizen who submitted it (message unchanged from before);
 *   - every department account whose `department` matches the complaint's
 *     department. A complaint with no department notifies no department
 *     account, rather than matching every one;
 *   - every monitor account. Monitors have no department and review
 *     completions for all departments, so each one is an appropriate recipient.
 *
 * Nothing here decides who may act on a complaint. That is still enforced by
 * the role and department checks in the controllers.
 */

const MINUTE_MS = 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;

const NOTIFICATION_TYPE = 'complaint_escalated';

const CITIZEN_MESSAGE = 'Your complaint has been automatically escalated because it exceeded its SLA.';

const ISSUE_LABELS = {
  pothole: 'Pothole',
  garbage: 'Garbage',
  water_leakage: 'Water leakage',
  streetlight: 'Streetlight',
  other: 'Other',
};

const formatOverdueDuration = (ms) => {
  const totalMinutes = Math.max(0, Math.floor(ms / MINUTE_MS));
  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const hours = Math.floor((totalMinutes % MINUTES_PER_DAY) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days} d ${hours} h`;
  }
  if (hours > 0) {
    return `${hours} h ${minutes} min`;
  }
  return `${minutes} min`;
};

const formatLocation = (location) => {
  if (location && location.address) {
    return location.address;
  }
  if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
    return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  }
  return 'location not provided';
};

// The facts a department or monitor needs to find the complaint. The full
// complaint id is included because the notification bell opens the complaint
// from it.
const describeEscalation = (complaint, step, now) => {
  const category = ISSUE_LABELS[complaint.issueType] || 'Unknown category';
  const overdue = formatOverdueDuration(now.getTime() - complaint.dueAt.getTime());

  return `Complaint ${complaint._id} (${category}) at ${formatLocation(complaint.location)} is ${overdue} past its SLA deadline and has been escalated to level ${step.level}.`;
};

const findDepartmentRecipientIds = async (department) => {
  // An undefined department in a query is stripped by Mongoose and matches
  // every department account, so a complaint without one notifies nobody here.
  if (!department) {
    return [];
  }
  const users = await User.find({ role: 'department', department }, '_id');
  return users.map((user) => user._id);
};

const findMonitorRecipientIds = async () => {
  const users = await User.find({ role: 'monitor' }, '_id');
  return users.map((user) => user._id);
};

/**
 * Sends the escalation notifications for one complaint and level.
 *
 * Resolves to true when every intended recipient has a notification
 * (including recipients who were already notified earlier), and to false if
 * any could not be saved or the recipients could not be looked up. It never
 * throws. Callers use the result to decide whether to advance the escalation
 * level.
 */
const notifyEscalation = async (complaint, step, now) => {
  try {
    const details = describeEscalation(complaint, step, now);

    const [departmentIds, monitorIds] = await Promise.all([
      findDepartmentRecipientIds(complaint.department),
      findMonitorRecipientIds(),
    ]);

    if (departmentIds.length === 0) {
      console.warn(
        `[escalation] No department accounts found for "${complaint.department}" (complaint ${complaint._id}); no department notification sent`
      );
    }
    if (monitorIds.length === 0) {
      console.warn(`[escalation] No monitor accounts found (complaint ${complaint._id}); no monitor notification sent`);
    }

    const base = { type: NOTIFICATION_TYPE, complaint: complaint._id, escalationLevel: step.level };

    const results = await Promise.all([
      createNotification({
        ...base,
        user: complaint.user,
        title: 'Complaint Escalated',
        message: CITIZEN_MESSAGE,
      }),
      ...departmentIds.map((userId) =>
        createNotification({
          ...base,
          user: userId,
          title: 'Overdue Complaint Escalated',
          message: `${details} Please prioritise this complaint.`,
        })
      ),
      ...monitorIds.map((userId) =>
        createNotification({
          ...base,
          user: userId,
          title: 'Overdue Complaint Escalated',
          message: `${details} It will appear in your verification queue once the department submits completed work.`,
        })
      ),
    ]);

    return results.every(Boolean);
  } catch (error) {
    console.error(`[escalation] Failed to notify recipients for complaint ${complaint._id}:`, error.message);
    return false;
  }
};

module.exports = { notifyEscalation, describeEscalation, formatOverdueDuration, NOTIFICATION_TYPE, CITIZEN_MESSAGE };
