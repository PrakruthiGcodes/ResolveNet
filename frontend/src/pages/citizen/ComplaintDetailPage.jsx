import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageContainer, Card, CardHeader, Badge, LoadingState, ErrorState, Button } from '../../components/ui';
import { StatusTimeline } from '../../components/complaints/StatusTimeline';
import { SlaIndicator } from '../../components/complaints/SlaIndicator';
import { EscalationIndicator } from '../../components/complaints/EscalationIndicator';
import { IssueTypeConfirmation } from '../../components/complaints/IssueTypeConfirmation';
import { IssueLocation } from '../../components/complaints/IssueLocation';
import { ComplaintPhoto } from '../../components/complaints/ComplaintPhoto';
import { getComplaintById } from '../../services/complaintService';
import { getErrorMessage } from '../../services/apiClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  describeImageAnalysis,
  hasImageDetection,
  isEscalated,
  isNeedsConfirmation,
  isWorkInProgress,
} from '../../utils/complaintHelpers';
import { formatIssueType, formatStatus, formatDateTime, formatComplaintRef } from '../../utils/formatters';
import './ComplaintDetailPage.css';

export function ComplaintDetailPage() {
  const { id } = useParams();
  useDocumentTitle('Complaint Details');

  const [complaint, setComplaint] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadComplaint = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await getComplaintById(id);
      setComplaint(data.complaint);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load this complaint.'));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadComplaint();
  }, [loadComplaint]);

  if (isLoading) {
    return (
      <PageContainer title="Complaint Details">
        <LoadingState label="Loading complaint…" />
      </PageContainer>
    );
  }

  if (error || !complaint) {
    return (
      <PageContainer title="Complaint Details">
        <ErrorState description={error || 'Complaint not found.'} onRetry={loadComplaint} />
      </PageContainer>
    );
  }

  // escalationLevel/escalatedAt are never cleared on resolution (see
  // backend/controllers/complaintController.js updateDepartmentComplaintStatus)
  // so a complaint's escalation history stays visible even after it's resolved.
  const wasEscalated = isEscalated(complaint);
  const hasImage = Boolean(complaint.image?.url);
  // Department and deadline are not set until the issue type is confirmed.
  const needsConfirmation = isNeedsConfirmation(complaint);

  return (
    <PageContainer
      title={`Complaint ${formatComplaintRef(complaint._id)}`}
      subtitle={`Reported ${formatDateTime(complaint.createdAt)}`}
      actions={<Button variant="outline" to="/citizen/complaints">Back to My Complaints</Button>}
    >
      <div className="rn-detail-badges">
        <Badge variant="neutral">
          {needsConfirmation ? 'Issue type not confirmed' : formatIssueType(complaint.issueType)}
        </Badge>
        <Badge variant="info">{complaint.department || 'Unassigned'}</Badge>
        <Badge variant={needsConfirmation ? 'warning' : complaint.status === 'resolved' ? 'success' : 'info'}>
          {isWorkInProgress(complaint) ? 'In progress' : formatStatus(complaint.status)}
        </Badge>
      </div>

      <div className="rn-detail-grid">
        <div className="rn-detail-grid__main">
          <Card>
            <CardHeader title="Report Details" />
            {needsConfirmation && (
              <IssueTypeConfirmation complaint={complaint} onConfirmed={setComplaint} />
            )}

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
                    {hasImageDetection(complaint.imageClassification) ? (
                      <>
                        {formatIssueType(complaint.imageClassification.issueType)}
                        <span className="rn-detail-classification__confidence">
                          {' '}
                          ({Math.round(complaint.imageClassification.confidence * 100)}% confidence)
                        </span>
                      </>
                    ) : (
                      describeImageAnalysis(complaint.imageClassification)
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </Card>
        </div>

        <div className="rn-detail-grid__side">
          <Card>
            <CardHeader title="Status" />
            {needsConfirmation ? (
              <p className="rn-detail-side-note">
                Waiting for you to confirm the issue type. The complaint has not been sent to a department yet.
              </p>
            ) : (
              <StatusTimeline status={complaint.status} />
            )}
          </Card>

          <IssueLocation location={complaint.location} />

          <Card>
            <CardHeader title="SLA" />
            <SlaIndicator complaint={complaint} />
            {complaint.status === 'submitted' && complaint.dueAt && (
              <p className="rn-detail-side-note">Deadline: {formatDateTime(complaint.dueAt)}</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Escalation" />
            <EscalationIndicator complaint={complaint} />
            {wasEscalated && (
              <p className="rn-detail-side-note">
                This complaint was escalated on {formatDateTime(complaint.escalatedAt)} after exceeding
                its SLA deadline.
                {complaint.status === 'resolved' && ' It has since been resolved.'}
              </p>
            )}
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
