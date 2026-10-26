import { useCallback, useEffect, useState } from 'react';
import { PageContainer, Button, LoadingState, ErrorState, EmptyState } from '../../components/ui';
import { ComplaintCard } from '../../components/complaints/ComplaintCard';
import { getMyComplaints } from '../../services/complaintService';
import { getErrorMessage } from '../../services/apiClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './ComplaintsListPage.css';

export function ComplaintsListPage() {
  useDocumentTitle('My Complaints');

  const [complaints, setComplaints] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadComplaints = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await getMyComplaints();
      setComplaints(data.complaints);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load your complaints.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  return (
    <PageContainer
      title="My Complaints"
      subtitle="Track the status, department, and resolution deadline for every issue you've reported."
      actions={<Button to="/citizen/report">Report an Issue</Button>}
    >
      {isLoading && <LoadingState label="Loading your complaints…" />}

      {!isLoading && error && <ErrorState description={error} onRetry={loadComplaints} />}

      {!isLoading && !error && complaints?.length === 0 && (
        <EmptyState
          icon="☰"
          title="No complaints yet"
          description="You haven't reported any issues. When you do, they'll show up here with live status and SLA tracking."
          action={<Button to="/citizen/report">Report an Issue</Button>}
        />
      )}

      {!isLoading && !error && complaints?.length > 0 && (
        <div className="rn-complaint-list">
          {complaints.map((complaint) => (
            <ComplaintCard
              key={complaint._id}
              complaint={complaint}
              detailPath={`/citizen/complaints/${complaint._id}`}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
