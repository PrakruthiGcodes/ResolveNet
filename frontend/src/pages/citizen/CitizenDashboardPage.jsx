import { useEffect, useState } from 'react';
import { PageContainer, StatCard, Button, LoadingState, ErrorState, EmptyState } from '../../components/ui';
import { ComplaintCard } from '../../components/complaints/ComplaintCard';
import { useAuth } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getMyComplaints } from '../../services/complaintService';
import { getErrorMessage } from '../../services/apiClient';
import './DashboardPreview.css';
import './ComplaintsListPage.css';

const RECENT_COUNT = 3;

export function CitizenDashboardPage() {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();

  const [complaints, setComplaints] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    getMyComplaints()
      .then((data) => {
        if (isMounted) setComplaints(data.complaints);
      })
      .catch((err) => {
        if (isMounted) setError(getErrorMessage(err, 'Unable to load your complaints.'));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const active = complaints?.filter((c) => c.status !== 'resolved' && c.escalationLevel < 1).length ?? 0;
  const escalated = complaints?.filter((c) => c.status !== 'resolved' && c.escalationLevel >= 1).length ?? 0;
  const resolved = complaints?.filter((c) => c.status === 'resolved').length ?? 0;
  const recent = complaints?.slice(0, RECENT_COUNT) ?? [];

  return (
    <PageContainer
      title={`Welcome back, ${user?.name?.split(' ')[0] || 'citizen'}`}
      subtitle="Here's an overview of the civic issues you've reported."
      actions={<Button to="/citizen/report">Report an Issue</Button>}
    >
      {isLoading && <LoadingState label="Loading your dashboard…" />}

      {!isLoading && error && <ErrorState description={error} />}

      {!isLoading && !error && (
        <>
          <div className="rn-stat-row">
            <StatCard label="Total Complaints" value={complaints.length} tone="neutral" />
            <StatCard label="Active Reports" value={active} tone="neutral" />
            <StatCard label="Escalated" value={escalated} tone="danger" />
            <StatCard label="Resolved" value={resolved} tone="success" />
          </div>

          {complaints.length === 0 ? (
            <EmptyState
              icon="✎"
              title="No complaints yet"
              description="Report your first civic issue and ResolveNet will classify, route, and track it automatically."
              action={<Button to="/citizen/report">Report an Issue</Button>}
            />
          ) : (
            <>
              <div className="rn-dashboard-section-header">
                <h2>Recent Complaints</h2>
                <Button variant="ghost" size="sm" to="/citizen/complaints">
                  View all
                </Button>
              </div>
              <div className="rn-complaint-list">
                {recent.map((complaint) => (
                  <ComplaintCard
                    key={complaint._id}
                    complaint={complaint}
                    detailPath={`/citizen/complaints/${complaint._id}`}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}
