// Single source of truth for "is this complaint overdue / escalated" so the
// dashboard stats, list filters, and detail view can never disagree with
// each other. Mirrors the backend's own definitions (see
// backend/services/escalationService.js) without duplicating its logic -
// this only reads fields the backend already computed and stored.

// The department SLA only runs while a complaint is 'submitted'. Backend
// semantics (see backend/services/escalationService.js and
// complaintController.js):
//   - pending_verification: the SLA is paused. The complaint is never overdue
//     here, even if dueAt has passed.
//   - resolved: finished. Never overdue.
//   - submitted: dueAt is the applicable deadline. After a monitor rejection,
//     dueAt is reset to a rework deadline, so overdue is judged against that.
export const isOverdue = (complaint) =>
  complaint.status === 'submitted' &&
  Boolean(complaint.dueAt) &&
  new Date(complaint.dueAt).getTime() < Date.now();

export const isEscalated = (complaint) => (complaint.escalationLevel ?? 0) >= 1;

export const isPendingVerification = (complaint) => complaint.status === 'pending_verification';

// The complaint has no department or SLA until the citizen confirms its issue
// type. See backend/services/issueConfirmation.js.
export const isNeedsConfirmation = (complaint) => complaint.status === 'needs_confirmation';

// Whether the photo produced a usable detection. Older documents have no
// `detected` flag, so a positive confidence is used as the fallback.
export const hasImageDetection = (imageClassification) => {
  if (!imageClassification || imageClassification.modelAvailable !== true) return false;
  return imageClassification.detected ?? (typeof imageClassification.confidence === 'number' && imageClassification.confidence > 0);
};

// A plain-language reason for citizens. Returns null when the photo produced a
// detection, so there is nothing to explain. The backend's raw message is not
// shown, because some of its text describes internal setup.
export const describeImageAnalysis = (imageClassification) => {
  if (!imageClassification) return null;
  if (imageClassification.modelAvailable !== true) {
    return 'Automatic photo analysis was not available for this photo.';
  }
  if (!hasImageDetection(imageClassification)) {
    return 'Automatic photo analysis did not find a known issue in this photo.';
  }
  return null;
};

// The backend has no 'returned' status. A complaint returned by a monitor is
// 'submitted' again with verification.rejectionReason set. The department
// cannot set 'submitted' itself (see VALID_AUTHORITY_STATUSES), so a
// 'submitted' complaint with a rejection reason must have been returned.
export const isReturnedForRework = (complaint) =>
  complaint.status === 'submitted' && Boolean(complaint.verification?.rejectionReason);

// The department's work status (see backend/services/complaintStatus.js). It
// only applies while a complaint is 'submitted'. A complaint saved before the
// field existed has no workStatus, which means not started.
export const isWorkInProgress = (complaint) =>
  complaint.status === 'submitted' && complaint.workStatus === 'in_progress';

// One label per complaint for the status badge, using the existing backend
// statuses plus the rework, overdue and work flags derived above. Precedence:
// resolved > pending verification > returned > overdue > in progress > not started.
// Escalation has its own indicator and is not part of this label.
export const getDisplayStatus = (complaint) => {
  if (complaint.status === 'resolved') {
    return { label: 'Resolved', variant: 'success' };
  }
  if (isNeedsConfirmation(complaint)) {
    return { label: 'Awaiting your confirmation', variant: 'warning' };
  }
  if (isPendingVerification(complaint)) {
    return { label: 'Pending verification', variant: 'info' };
  }
  if (isReturnedForRework(complaint)) {
    return { label: 'Returned for rework', variant: 'warning' };
  }
  if (isOverdue(complaint)) {
    return { label: 'Overdue', variant: 'danger' };
  }
  if (isWorkInProgress(complaint)) {
    return { label: 'In progress', variant: 'info' };
  }
  return { label: 'Not started', variant: 'neutral' };
};
