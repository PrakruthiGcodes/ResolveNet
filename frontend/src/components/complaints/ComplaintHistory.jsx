import { formatDateTime } from '../../utils/formatters';

// Labels for the actions stored in verificationHistory (backend/models/Complaint.js).
const HISTORY_ACTION_LABELS = {
  issue_confirmed: 'Issue type confirmed',
  issue_corrected: 'Issue type corrected',
  work_started: 'Work started',
  completion_submitted: 'Submitted for verification',
  approved: 'Approved by monitor',
  rejected: 'Returned for rework',
};

// Rows for the history list, in the order the backend recorded them. The
// work-started time is shown from workStartedAt when it is present, so the
// matching work_started entry is skipped to avoid showing it twice. Nothing is
// added that the API did not return.
const getHistoryRows = (complaint) => {
  const hasWorkStartedField = Boolean(complaint.workStartedAt);
  const rows = [];

  if (hasWorkStartedField) {
    rows.push({ key: 'work-started', label: 'Work started', at: complaint.workStartedAt });
  }

  (complaint.verificationHistory ?? []).forEach((entry, index) => {
    if (entry.action === 'work_started' && hasWorkStartedField) return;
    rows.push({
      key: `${entry.action}-${index}`,
      label: HISTORY_ACTION_LABELS[entry.action] || 'Update recorded',
      at: entry.at,
    });
  });

  return rows;
};

// Recorded events for one complaint. Renders nothing when there are none, so
// no event or date is ever shown that the API did not return.
export function ComplaintHistory({ complaint }) {
  const rows = getHistoryRows(complaint);
  if (rows.length === 0) return null;

  return (
    <dl className="rn-detail-classification">
      {rows.map((row) => (
        <div key={row.key}>
          <dt>{row.label}</dt>
          <dd>{formatDateTime(row.at)}</dd>
        </div>
      ))}
    </dl>
  );
}
