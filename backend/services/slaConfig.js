/**
 * SLA (time-to-resolve) configuration for automatic escalation.
 *
 * These are configurable project/demo values, NOT claims about official
 * government SLA commitments. Keyed by the same application-level
 * issueType used for department routing (see departmentRouter.js) — not
 * raw YOLO class names.
 */

const DEFAULT_SLA_HOURS = 48; // used for 'other' and any missing/unknown issueType

const SLA_HOURS_BY_ISSUE_TYPE = {
  pothole: 24,
  garbage: 12,
  water_leakage: 12,
  streetlight: 24,
  other: DEFAULT_SLA_HOURS,
};

const getSlaHours = (issueType) => SLA_HOURS_BY_ISSUE_TYPE[issueType] ?? DEFAULT_SLA_HOURS;

const calculateDueAt = (issueType, fromDate = new Date()) => {
  const hours = getSlaHours(issueType);
  return new Date(fromDate.getTime() + hours * 60 * 60 * 1000);
};

// Deadline for department rework after a monitor rejects a completion. One
// project-wide value, not per issue type. The escalation level already set on
// the complaint is kept; only the active deadline is reset.
const REWORK_SLA_HOURS = 24;

const calculateReworkDueAt = (fromDate = new Date()) =>
  new Date(fromDate.getTime() + REWORK_SLA_HOURS * 60 * 60 * 1000);

module.exports = {
  getSlaHours,
  calculateDueAt,
  calculateReworkDueAt,
  SLA_HOURS_BY_ISSUE_TYPE,
  DEFAULT_SLA_HOURS,
  REWORK_SLA_HOURS,
};
