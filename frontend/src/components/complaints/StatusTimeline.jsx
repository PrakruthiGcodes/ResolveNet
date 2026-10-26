import './StatusTimeline.css';

// The three backend statuses (see backend/services/complaintStatus.js), in
// lifecycle order. Escalation is a separate concept (escalationLevel /
// escalatedAt) shown elsewhere, not a step here. A complaint returned for
// rework is 'submitted' again, so it shows at the first step.
const STEPS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'pending_verification', label: 'Pending verification' },
  { key: 'resolved', label: 'Resolved' },
];

const STEP_INDEX_BY_STATUS = {
  submitted: 0,
  pending_verification: 1,
  resolved: 2,
};

export function StatusTimeline({ status }) {
  const currentIndex = STEP_INDEX_BY_STATUS[status] ?? 0;

  return (
    <ol className="rn-timeline">
      {STEPS.map((step, index) => {
        const isComplete = index <= currentIndex;
        const isLineComplete = index + 1 <= currentIndex;
        const isLast = index === STEPS.length - 1;

        return (
          <li key={step.key} className={`rn-timeline__step${isComplete ? ' rn-timeline__step--complete' : ''}`}>
            <span className="rn-timeline__marker" aria-hidden="true">
              <span className="rn-timeline__dot" />
              {!isLast && (
                <span className={`rn-timeline__line${isLineComplete ? ' rn-timeline__line--complete' : ''}`} />
              )}
            </span>
            <span className="rn-timeline__label">
              {step.label}
              {isComplete && index === currentIndex && <span className="rn-timeline__current"> (current)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
