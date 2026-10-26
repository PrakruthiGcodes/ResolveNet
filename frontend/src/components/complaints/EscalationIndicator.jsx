import { Badge } from '../ui';
import { isEscalated } from '../../utils/complaintHelpers';

// Escalation is never a complaint status - a complaint can be escalated AND
// submitted, or escalated AND resolved. This is deliberately independent
// from status, and never clears escalation history once it has happened
// (see backend/controllers/complaintController.js updateDepartmentComplaintStatus,
// which never touches escalationLevel/escalatedAt).
export function EscalationIndicator({ complaint }) {
  if (!isEscalated(complaint)) {
    return <Badge variant="neutral">Not escalated</Badge>;
  }

  if (complaint.status === 'resolved') {
    return <Badge variant="warning">Escalated — Resolved</Badge>;
  }

  return <Badge variant="danger">Escalated</Badge>;
}
