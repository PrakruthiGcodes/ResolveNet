/**
 * Escalation progression.
 *
 * Each entry is one escalation level. `hoursAfterDue` is how long after the
 * complaint's dueAt (its SLA deadline) that level becomes due, so level 1
 * with hoursAfterDue 0 means "escalate as soon as the SLA is breached".
 *
 * Levels must be numbered 1..N in order with strictly increasing offsets.
 * The default is a single level, which is the behaviour the app has always
 * had. To add a second level, append an entry such as
 * { level: 2, hoursAfterDue: 24 }. Complaints move up one level per check,
 * and never past the last level, so escalation cannot repeat without limit.
 *
 * The table is validated when this module loads, so a bad configuration stops
 * the server at startup instead of escalating complaints incorrectly.
 */

const HOUR_MS = 60 * 60 * 1000;

const ESCALATION_LEVELS = [{ level: 1, hoursAfterDue: 0 }];

const validateEscalationLevels = (levels) => {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new Error('Escalation levels must be a non-empty array');
  }

  levels.forEach((entry, index) => {
    if (entry.level !== index + 1) {
      throw new Error(`Escalation level ${entry.level} must be numbered ${index + 1} (levels run 1..N in order)`);
    }
    if (!Number.isFinite(entry.hoursAfterDue) || entry.hoursAfterDue < 0) {
      throw new Error(`Escalation level ${entry.level} needs a hoursAfterDue of 0 or more`);
    }
    if (index > 0 && entry.hoursAfterDue <= levels[index - 1].hoursAfterDue) {
      throw new Error(`Escalation level ${entry.level} must come after level ${index} (hoursAfterDue must increase)`);
    }
  });

  return levels;
};

validateEscalationLevels(ESCALATION_LEVELS);

const getMaxEscalationLevel = (levels = ESCALATION_LEVELS) => levels.length;

/**
 * Returns the level a complaint should move to next, or null if there is none
 * or it is not due yet. Only the next level is ever returned, so a complaint
 * climbs one step per check.
 */
const getNextEscalation = (complaint, now, levels = ESCALATION_LEVELS) => {
  if (!complaint.dueAt) {
    return null;
  }

  // levels[n] is level n + 1, so the complaint's current level is also the
  // index of the next one.
  const current = complaint.escalationLevel ?? 0;
  const step = levels[current];
  if (!step) {
    return null;
  }

  const dueAtMs = complaint.dueAt.getTime() + step.hoursAfterDue * HOUR_MS;
  return now.getTime() >= dueAtMs ? step : null;
};

module.exports = {
  ESCALATION_LEVELS,
  validateEscalationLevels,
  getMaxEscalationLevel,
  getNextEscalation,
};
