import { useCallback, useEffect, useState } from 'react';
import { PageContainer, Card, CardHeader, Badge, Button, LoadingState, ErrorState, EmptyState } from '../../components/ui';
import { ComplaintHistory } from '../../components/complaints/ComplaintHistory';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getAllMonitorComplaints } from '../../services/complaintService';
import { getErrorMessage } from '../../services/apiClient';
import { formatIssueType, formatStatus, formatDateTime, formatComplaintRef } from '../../utils/formatters';
import '../citizen/ComplaintDetailPage.css';
import './MonitorReviewPage.css';

// Read-only view of every complaint and its recorded history. Approvals and
// rework returns stay on the Pending Verification page.
export function MonitorComplaintsPage() {
  useDocumentTitle('All Complaints');

  const [complaints, setComplaints] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadComplaints = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await getAllMonitorComplaints();
      setComplaints(data.complaints);
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Unable to load complaints.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  return (
    <PageContainer
      eyebrow="ResolveNet — Monitor Portal"
      title="All Complaints"
      subtitle="Every complaint with its current status and recorded history. This view is read-only."
      actions={
        <Button variant="outline" onClick={loadComplaints} isLoading={isLoading}>
          Refresh
        </Button>
      }
    >
      {isLoading && <LoadingState label="Loading complaints…" />}

      {!isLoading && loadError && <ErrorState description={loadError} onRetry={loadComplaints} />}

      {!isLoading && !loadError && complaints.length === 0 && (
        <EmptyState icon="○" title="No complaints yet" description="No complaints have been submitted." />
      )}

      {!isLoading && !loadError && complaints.length > 0 && (
        <div className="rn-monitor-list">
          {complaints.map((complaint) => (
            <Card key={complaint._id} className="rn-monitor-card">
              <CardHeader
                title={`Complaint ${formatComplaintRef(complaint._id)}`}
                subtitle={`Submitted ${formatDateTime(complaint.createdAt)}`}
              />

              <div className="rn-detail-badges">
                <Badge variant="neutral">{formatIssueType(complaint.issueType)}</Badge>
                <Badge variant="info">{complaint.department}</Badge>
                <Badge variant={complaint.status === 'resolved' ? 'success' : 'neutral'}>
                  {formatStatus(complaint.status)}
                </Badge>
                {complaint.workStatus === 'in_progress' && <Badge variant="warning">Work in progress</Badge>}
                {complaint.escalationLevel >= 1 && <Badge variant="danger">Escalated</Badge>}
              </div>

              <p className="rn-detail-description">{complaint.description}</p>

              <ComplaintHistory complaint={complaint} />
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
