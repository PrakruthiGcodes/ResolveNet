import { isOverdue, isPendingVerification } from '../../utils/complaintHelpers';
import { formatDateTime } from '../../utils/formatters';
import './SlaIndicator.css';

// Always reads the backend's real dueAt - never computes or replaces the
// SLA deadline itself, only labels it relative to the current time.
export function SlaIndicator({ complaint }) {
  // No deadline exists until the citizen confirms the issue type, because the
  // deadline depends on the confirmed type.
  if (complaint.status === 'needs_confirmation') {
    return <span className="rn-sla rn-sla--neutral">Starts after confirmation</span>;
  }

  if (!complaint.dueAt) {
    return <span className="rn-sla rn-sla--neutral">No SLA</span>;
  }

  if (complaint.status === 'resolved') {
    return <span className="rn-sla rn-sla--resolved">Resolved by {formatDateTime(complaint.dueAt)}</span>;
  }

  // The SLA is paused while a completion awaits monitor review, so neither
  // "Due" nor "Overdue" applies.
  if (isPendingVerification(complaint)) {
    return <span className="rn-sla rn-sla--neutral">Paused while awaiting verification</span>;
  }

  if (isOverdue(complaint)) {
    return <span className="rn-sla rn-sla--overdue">Overdue</span>;
  }

  return <span className="rn-sla rn-sla--upcoming">Due {formatDateTime(complaint.dueAt)}</span>;
}
