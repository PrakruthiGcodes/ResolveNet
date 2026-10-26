import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageContainer, Card, StatCard, Button, LoadingState, ErrorState, EmptyState } from '../../components/ui';
import { SlaIndicator } from '../../components/complaints/SlaIndicator';
import { EscalationIndicator } from '../../components/complaints/EscalationIndicator';
import { useAuth } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getDepartmentComplaints } from '../../services/complaintService';
import { getErrorMessage } from '../../services/apiClient';
import { isOverdue, isEscalated, isPendingVerification, isWorkInProgress } from '../../utils/complaintHelpers';
import { formatIssueType, formatComplaintRef } from '../../utils/formatters';
import './AuthorityDashboardPage.css';

export function AuthorityDashboardPage() {
  useDocumentTitle('Department Dashboard');
  const { department } = useAuth();

  const [complaints, setComplaints] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    getDepartmentComplaints()
      .then((data) => {
        if (isMounted) setComplaints(data.complaints);
      })
      .catch((err) => {
        if (isMounted) setError(getErrorMessage(err, 'Unable to load department complaints.'));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Every metric is derived directly from the real complaint fields
  // returned by GET /api/complaints/department - nothing here is a
  // fabricated or estimated number.
  const stats = useMemo(() => {
    if (!complaints) return null;
    return {
      total: complaints.length,
      inProgress: complaints.filter(isWorkInProgress).length,
      pendingVerification: complaints.filter(isPendingVerification).length,
      resolved: complaints.filter((c) => c.status === 'resolved').length,
      escalated: complaints.filter(isEscalated).length,
      overdue: complaints.filter(isOverdue).length,
    };
  }, [complaints]);

  const needsAttention = useMemo(() => {
    if (!complaints) return [];
    return complaints
      .filter((c) => c.status !== 'resolved' && (isOverdue(c) || isEscalated(c)))
      .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
      .slice(0, 5);
  }, [complaints]);

  return (
    <PageContainer
      eyebrow="ResolveNet — Department Authority Portal"
      title={department || 'Your Department'}
      subtitle="Manage and monitor civic complaints assigned to your department."
      actions={<Button to="/authority/complaints">View Department Complaints</Button>}
    >
      {isLoading && <LoadingState label="Loading department data…" />}

      {!isLoading && error && <ErrorState description={error} />}

      {!isLoading && !error && stats && (
        <>
          <div className="rn-authority-stats">
            <StatCard label="Total Complaints" value={stats.total} tone="neutral" />
            <StatCard label="In Progress" value={stats.inProgress} tone="neutral" />
            <StatCard label="Pending Verification" value={stats.pendingVerification} tone="neutral" />
            <StatCard label="Resolved" value={stats.resolved} tone="success" />
            <StatCard label="Overdue" value={stats.overdue} tone="warning" />
            <StatCard label="Escalated" value={stats.escalated} tone="danger" />
          </div>

          <div className="rn-dashboard-section-header">
            <h2>Requires Attention</h2>
            <span className="rn-dashboard-section-header__hint">Overdue or escalated, still unresolved</span>
          </div>

          {needsAttention.length === 0 ? (
            <EmptyState
              icon="✓"
              title="Nothing requires attention"
              description={`No overdue or escalated complaints for ${department} right now.`}
            />
          ) : (
            <Card padded={false} className="rn-attention-list">
              {needsAttention.map((complaint) => (
                <Link
                  key={complaint._id}
                  to={`/authority/complaints/${complaint._id}`}
                  className="rn-attention-row"
                >
                  <div className="rn-attention-row__main">
                    <span className="rn-attention-row__ref">{formatComplaintRef(complaint._id)}</span>
                    <span className="rn-attention-row__type">{formatIssueType(complaint.issueType)}</span>
                    <p className="rn-attention-row__description">{complaint.description}</p>
                  </div>
                  <div className="rn-attention-row__indicators">
                    <SlaIndicator complaint={complaint} />
                    <EscalationIndicator complaint={complaint} />
                  </div>
                </Link>
              ))}
            </Card>
          )}
        </>
      )}
    </PageContainer>
  );
}
