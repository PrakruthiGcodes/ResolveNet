import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  PageContainer,
  Card,
  CardHeader,
  Badge,
  Button,
  Alert,
  LoadingState,
  ErrorState,
} from '../../components/ui';
import { SlaIndicator } from '../../components/complaints/SlaIndicator';
import { EscalationIndicator } from '../../components/complaints/EscalationIndicator';
import { IssueLocation } from '../../components/complaints/IssueLocation';
import { ComplaintPhoto } from '../../components/complaints/ComplaintPhoto';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  getDepartmentComplaints,
  updateComplaintStatus,
  updateComplaintWorkStatus,
} from '../../services/complaintService';
import { getErrorMessage } from '../../services/apiClient';
import {
  isEscalated,
  getDisplayStatus,
  isPendingVerification,
  isReturnedForRework,
  isWorkInProgress,
} from '../../utils/complaintHelpers';
import { formatIssueType, formatDateTime, formatComplaintRef } from '../../utils/formatters';
import '../citizen/ComplaintDetailPage.css';
import './AuthorityComplaintDetailPage.css';

export function AuthorityComplaintDetailPage() {
  const { id } = useParams();
  useDocumentTitle('Complaint Details');

  const [complaint, setComplaint] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // There is no single-complaint endpoint for authorities (GET
  // /api/complaints/:id is scoped to the citizen owner and will 404 for a
  // department account). The department list endpoint is the only
  // authority-accessible source, so the detail view loads it and finds the
  // matching complaint client-side.
  const loadComplaint = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    setNotFound(false);
    try {
      const data = await getDepartmentComplaints();
      const match = data.complaints.find((c) => c._id === id);
      if (!match) {
        setNotFound(true);
      } else {
        setComplaint(match);
      }
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Unable to load this complaint.'));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadComplaint();
  }, [loadComplaint]);

  // Marks the complaint as being worked on. The status stays 'submitted', so
  // the deadline and escalation are unchanged.
  const handleStartWork = async () => {
    setUpdateError('');
    setUpdateSuccess('');
    setIsUpdating(true);
    try {
      const data = await updateComplaintWorkStatus(id, 'in_progress');
      setComplaint(data.complaint);
      setUpdateSuccess('Work marked as in progress.');
    } catch (err) {
      setUpdateError(getErrorMessage(err, 'Unable to mark this complaint as in progress. Please try again.'));
    } finally {
      setIsUpdating(false);
    }
  };

  // The department can only ask for verification. The backend moves the
  // complaint to 'pending_verification', and only a monitor can resolve it.
  const handleSubmitForVerification = async () => {
    setUpdateError('');
    setUpdateSuccess('');
    setIsUpdating(true);
    try {
      const data = await updateComplaintStatus(id, 'resolved');
      setComplaint(data.complaint);
      setUpdateSuccess('Work submitted for verification. The complaint stays open until a monitor approves it.');
    } catch (err) {
      setUpdateError(getErrorMessage(err, 'Unable to submit for verification. Please try again.'));
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <PageContainer title="Complaint Details">
        <LoadingState label="Loading complaint…" />
      </PageContainer>
    );
  }

  if (notFound) {
    return (
      <PageContainer title="Complaint Details" actions={<Button variant="outline" to="/authority/complaints">Back to Complaints</Button>}>
        <ErrorState
          title="Complaint not found"
          description="This complaint doesn't exist, or isn't assigned to your department."
        />
      </PageContainer>
    );
  }

  if (loadError || !complaint) {
    return (
      <PageContainer title="Complaint Details">
        <ErrorState description={loadError || 'Complaint not found.'} onRetry={loadComplaint} />
      </PageContainer>
    );
  }

  const wasEscalated = isEscalated(complaint);
  const hasImage = Boolean(complaint.image?.url);
  const hasImageData = Boolean(hasImage || complaint.imageClassification);
  const displayStatus = getDisplayStatus(complaint);
  const pending = isPendingVerification(complaint);
  const returned = isReturnedForRework(complaint);
  const inProgress = isWorkInProgress(complaint);

  return (
    <PageContainer
      title={`Complaint ${formatComplaintRef(complaint._id)}`}
      subtitle={`Reported ${formatDateTime(complaint.createdAt)}`}
      actions={<Button variant="outline" to="/authority/complaints">Back to Complaints</Button>}
    >
      <div className="rn-detail-badges">
        <Badge variant="neutral">{formatIssueType(complaint.issueType)}</Badge>
        <Badge variant="info">{complaint.department}</Badge>
        <Badge variant={displayStatus.variant}>{displayStatus.label}</Badge>
      </div>

      <div className="rn-detail-grid">
        <div className="rn-detail-grid__main">
          <Card>
            <CardHeader title="Complaint Information" />
            <p className="rn-detail-description">{complaint.description}</p>

            <ComplaintPhoto complaintId={complaint._id} hasImage={hasImage} />

            <dl className="rn-detail-classification">
              <div>
                <dt>Text classification</dt>
                <dd>
                  {formatIssueType(complaint.issueType)}
                  {typeof complaint.confidence === 'number' && (
                    <span className="rn-detail-classification__confidence">
                      {' '}
                      ({Math.round(complaint.confidence * 100)}% confidence)
                    </span>
                  )}
                </dd>
              </div>

              {complaint.imageClassification && (
                <div>
                  <dt>Image classification</dt>
                  <dd>
                    {complaint.imageClassification.modelAvailable ? (
                      <>
                        {formatIssueType(complaint.imageClassification.issueType)}
                        <span className="rn-detail-classification__confidence">
                          {' '}
                          ({Math.round(complaint.imageClassification.confidence * 100)}% confidence)
                        </span>
                      </>
                    ) : (
                      complaint.imageClassification.message || 'Not available for this report.'
                    )}
                  </dd>
                </div>
              )}

              {!hasImageData && (
                <div>
                  <dt>Photo</dt>
                  <dd className="rn-detail-classification__unavailable">
                    No photo was attached to this report.
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Update Status" />
            {updateError && <Alert variant="error">{updateError}</Alert>}
            {updateSuccess && <Alert variant="success">{updateSuccess}</Alert>}

            {returned && (
              <Alert variant="warning">
                <strong>Returned for rework</strong>
                {complaint.verification?.reviewedAt && <> on {formatDateTime(complaint.verification.reviewedAt)}</>}.
                <br />
                Monitor&rsquo;s reason: {complaint.verification.rejectionReason}
                <br />
                Rework deadline: {formatDateTime(complaint.dueAt)}
              </Alert>
            )}

            <div className="rn-status-update">
              <div>
                <span className="rn-status-update__label">Current Status</span>
                <Badge variant={displayStatus.variant}>{displayStatus.label}</Badge>
              </div>

              {complaint.status === 'resolved' && (
                <p className="rn-status-update__note">A monitor has approved this completion.</p>
              )}

              {pending && (
                <p className="rn-status-update__note">
                  Submitted for monitor verification on {formatDateTime(complaint.verification?.submittedAt)}. The
                  deadline is paused until a monitor approves or returns it.
                </p>
              )}

              {complaint.status === 'submitted' && (
                <div>
                  {!inProgress && (
                    <Button variant="outline" onClick={handleStartWork} isLoading={isUpdating}>
                      Start Work
                    </Button>
                  )}
                  <Button onClick={handleSubmitForVerification} isLoading={isUpdating}>
                    {returned ? 'Resubmit Work for Verification' : 'Submit Work for Verification'}
                  </Button>
                  <p className="rn-status-update__note">
                    This sends the work to a monitor. The complaint is not resolved until the monitor approves it.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="rn-detail-grid__side">
          <Card>
            <CardHeader title="Department" />
            <Badge variant="info">{complaint.department}</Badge>
            <p className="rn-detail-side-note">Assigned automatically. The department cannot be changed here.</p>
          </Card>

          <IssueLocation location={complaint.location} />

          <Card>
            <CardHeader title="SLA" />
            <SlaIndicator complaint={complaint} />
            {complaint.status !== 'resolved' && complaint.dueAt && (
              <p className="rn-detail-side-note">Deadline: {formatDateTime(complaint.dueAt)}</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Escalation" />
            <EscalationIndicator complaint={complaint} />
            {wasEscalated && (
              <p className="rn-detail-side-note">
                Escalated on {formatDateTime(complaint.escalatedAt)} after passing its SLA deadline
                unresolved.
                {complaint.status === 'resolved' && ' Resolved after escalation.'}
              </p>
            )}
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
