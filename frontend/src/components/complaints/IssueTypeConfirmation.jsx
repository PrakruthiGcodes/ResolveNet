import { useState } from 'react';
import { Alert, Button, Select } from '../ui';
import { confirmComplaintIssueType } from '../../services/complaintService';
import { getErrorMessage } from '../../services/apiClient';
import { ISSUE_TYPE_LABELS } from '../../utils/constants';
import { describeImageAnalysis } from '../../utils/complaintHelpers';
import { formatIssueType } from '../../utils/formatters';
import './IssueTypeConfirmation.css';

const ISSUE_TYPE_OPTIONS = Object.entries(ISSUE_TYPE_LABELS).map(([value, label]) => ({ value, label }));

// Shown for a complaint saved as 'needs_confirmation'. The photo could not be
// classified, or the photo and description disagree, so the citizen confirms or
// corrects the issue type. The department and deadline are only set after this,
// so nothing is routed yet.
export function IssueTypeConfirmation({ complaint, onConfirmed }) {
  const suggestedIssueType = complaint.issueType || 'other';
  // The description-based suggestion is only shown when there was a description
  // and it gave a specific type. A photo-only complaint has no such suggestion.
  const hasDescriptionSuggestion = Boolean(complaint.description) && suggestedIssueType !== 'other';
  const [selectedIssueType, setSelectedIssueType] = useState(suggestedIssueType);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // describeImageAnalysis explains a missing or failed analysis. When the model
  // did detect something but the result was not reliable enough to route on its
  // own (low confidence, or a type that always needs a citizen check), it returns
  // null, so a plain explanation is shown instead.
  const analysisReason =
    describeImageAnalysis(complaint.imageClassification) ||
    (complaint.imageClassification
      ? 'Automatic photo analysis was not certain enough to choose the issue type on its own.'
      : null);
  const isCorrection = selectedIssueType !== suggestedIssueType;

  const handleConfirm = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const data = await confirmComplaintIssueType(complaint._id, selectedIssueType);
      onConfirmed(data.complaint);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to confirm the issue type. Please try again.'));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rn-issue-confirm">
      <p className="rn-issue-confirm__lead">
        Please confirm the issue type. Your complaint will be sent to the responsible department once you do.
      </p>

      {analysisReason && <p className="rn-issue-confirm__reason">{analysisReason}</p>}

      {hasDescriptionSuggestion && (
        <p className="rn-issue-confirm__suggestion">
          Based on your description, we suggest: <strong>{formatIssueType(suggestedIssueType)}</strong>
        </p>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      <Select
        label="Issue type"
        value={selectedIssueType}
        onChange={(event) => setSelectedIssueType(event.target.value)}
        options={ISSUE_TYPE_OPTIONS}
        hint="Choose the type that matches the problem in your photo."
      />

      <div className="rn-issue-confirm__actions">
        <Button onClick={handleConfirm} isLoading={isSubmitting}>
          {isCorrection ? 'Submit corrected issue type' : 'Confirm issue type'}
        </Button>
      </div>

      <p className="rn-issue-confirm__note">
        Until you confirm, no department is assigned and the resolution deadline has not started.
      </p>
    </div>
  );
}
