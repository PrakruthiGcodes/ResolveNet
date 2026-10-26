/**
 * Complaint lifecycle statuses.
 *
 *   submitted            -> new, or returned for department rework after a
 *                           monitor rejection. The SLA clock applies.
 *   pending_verification -> a department has submitted completion; waiting
 *                           for a monitor. The department SLA is paused and
 *                           the complaint is never escalated in this state.
 *   resolved             -> a monitor approved the completion. Final.
 *
 *   needs_confirmation   -> the image could not be classified (model
 *                           unavailable, or no known issue detected), or its
 *                           prediction is not auto-routable (confidence below
 *                           the provisional threshold, or an 'other' or
 *                           'water_leakage' prediction; see
 *                           services/issueConfirmation.js). The
 *                           complaint has no department and no SLA yet. Only
 *                           the owning citizen can confirm or correct the
 *                           issue type, which moves it to submitted. No
 *                           department or monitor action is possible before
 *                           that, and the escalation check ignores it.
 *
 * Department authorities can only move submitted -> pending_verification.
 * Only monitors can move pending_verification -> resolved or -> submitted.
 *
 * Work status is a separate field on a 'submitted' complaint (see
 * WORK_STATUS below), so it never changes the lifecycle above:
 *   not_started -> in_progress, set by the assigned department.
 * It is ignored once the complaint leaves 'submitted', and a monitor's
 * return to 'submitted' sets it back to in_progress.
 */

const STATUS = {
  SUBMITTED: 'submitted',
  NEEDS_CONFIRMATION: 'needs_confirmation',
  PENDING_VERIFICATION: 'pending_verification',
  RESOLVED: 'resolved',
};

const COMPLAINT_STATUSES = Object.values(STATUS);

const WORK_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
};

const WORK_STATUSES = Object.values(WORK_STATUS);

module.exports = { STATUS, COMPLAINT_STATUSES, WORK_STATUS, WORK_STATUSES };
