import { Link } from 'react-router-dom';
import { Card, Badge } from '../ui';
import { EscalationIndicator } from './EscalationIndicator';
import { isEscalated, isWorkInProgress } from '../../utils/complaintHelpers';
import { formatIssueType, formatStatus, formatDateTime, formatRelativeToNow, formatComplaintRef } from '../../utils/formatters';
import './ComplaintCard.css';

export function ComplaintCard({ complaint, detailPath }) {
  return (
    <Card as={Link} to={detailPath} className="rn-complaint-card" padded>
      <div className="rn-complaint-card__top">
        <div className="rn-complaint-card__badges">
          <Badge variant="neutral">{formatIssueType(complaint.issueType)}</Badge>
          {/* Status and escalation are independent facts about a complaint,
              never merged into one badge - so an escalated-then-resolved
              complaint never reads as "still escalated." The escalation
              badge only appears when there's something to flag, so a
              normal, never-escalated complaint's card stays uncluttered. */}
          <Badge variant={complaint.status === 'resolved' ? 'success' : 'info'}>
            {isWorkInProgress(complaint) ? 'In progress' : formatStatus(complaint.status)}
          </Badge>
          {isEscalated(complaint) && <EscalationIndicator complaint={complaint} />}
        </div>
        <span className="rn-complaint-card__id">{formatComplaintRef(complaint._id)}</span>
      </div>

      <p className="rn-complaint-card__description">{complaint.description}</p>

      <div className="rn-complaint-card__meta">
        <span>{complaint.department || 'Unassigned'}</span>
        <span aria-hidden="true">·</span>
        <span>Reported {formatDateTime(complaint.createdAt)}</span>
        {complaint.dueAt && complaint.status === 'submitted' && (
          <>
            <span aria-hidden="true">·</span>
            <span>Due {formatRelativeToNow(complaint.dueAt)}</span>
          </>
        )}
      </div>
    </Card>
  );
}
