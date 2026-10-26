const Complaint = require('../models/Complaint');
const { STATUS } = require('./complaintStatus');
const { ESCALATION_LEVELS, getMaxEscalationLevel, getNextEscalation } = require('./escalationLevels');
const { notifyEscalation } = require('./escalationNotifications');

/**
 * Automatic escalation check.
 *
 * A complaint is a candidate when it is still status 'submitted', its SLA
 * deadline (dueAt) has passed, and it has not reached the last escalation
 * level. Each check moves a complaint up at most one level, and only once the
 * next level's time (see escalationLevels.js) has been reached.
 * Only 'submitted' is eligible: a complaint awaiting monitor verification
 * (pending_verification) has its department SLA paused, and a resolved one is
 * finished. A rejected complaint returns to 'submitted' with a new rework
 * deadline, so it is covered again.
 * Escalating only sets escalationLevel/escalatedAt. issueType, department,
 * and all original complaint data are left untouched, and `status` is
 * deliberately not repurposed for escalation state.
 *
 * Order for each complaint: notify, then advance. If any notification cannot
 * be saved, the level is left unchanged and the next check retries. Because
 * notifications are unique per recipient and escalation level, a retry never
 * sends a second copy to someone already notified. Advancing is guarded by the
 * complaint's current status, deadline and level, so a concurrent or repeated
 * run cannot escalate the same level twice.
 */

const findOverdueCandidates = (now, levels) =>
  Complaint.find({
    dueAt: { $lte: now },
    status: STATUS.SUBMITTED,
    // $not also matches documents saved before escalationLevel existed. A
    // plain $lt would skip them.
    escalationLevel: { $not: { $gte: getMaxEscalationLevel(levels) } },
  });

const advanceEscalation = async (complaint, step, now) => {
  const currentLevel = complaint.escalationLevel ?? 0;
  const result = await Complaint.updateOne(
    {
      _id: complaint._id,
      status: STATUS.SUBMITTED,
      dueAt: complaint.dueAt,
      // $in with null also matches documents saved before escalationLevel
      // existed. A plain 0 would not match them.
      escalationLevel: currentLevel === 0 ? { $in: [0, null] } : currentLevel,
    },
    {
      $set: {
        escalationLevel: step.level,
        escalatedAt: now,
      },
    }
  );
  return result.modifiedCount > 0;
};

const runEscalationCheck = async ({ now = new Date(), levels = ESCALATION_LEVELS } = {}) => {
  let candidates;

  try {
    candidates = await findOverdueCandidates(now, levels);
  } catch (error) {
    console.error('[escalation] Failed to query overdue complaints:', error.message);
    return { checked: 0, escalated: 0, failed: 0 };
  }

  let escalatedCount = 0;
  let failedCount = 0;

  for (const complaint of candidates) {
    try {
      const step = getNextEscalation(complaint, now, levels);
      if (!step) {
        continue;
      }

      const delivered = await notifyEscalation(complaint, step, now);
      if (!delivered) {
        // Leave the level alone so the next check retries this complaint.
        failedCount += 1;
        console.error(`[escalation] Notifications incomplete for complaint ${complaint._id}; will retry`);
        continue;
      }

      const advanced = await advanceEscalation(complaint, step, now);
      if (advanced) {
        escalatedCount += 1;
        console.log(
          `[escalation] Escalated complaint ${complaint._id} to level ${step.level} (issueType=${complaint.issueType}, department=${complaint.department})`
        );
      }
    } catch (error) {
      // Never let one bad complaint stop the rest of the batch.
      failedCount += 1;
      console.error(`[escalation] Failed to escalate complaint ${complaint._id}:`, error.message);
    }
  }

  return { checked: candidates.length, escalated: escalatedCount, failed: failedCount };
};

module.exports = { runEscalationCheck };
