import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  PageContainer,
  Card,
  Button,
  Input,
  Select,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components/ui';
import { SlaIndicator } from '../../components/complaints/SlaIndicator';
import { EscalationIndicator } from '../../components/complaints/EscalationIndicator';
import { useAuth } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getDepartmentComplaints } from '../../services/complaintService';
import { getErrorMessage } from '../../services/apiClient';
import { isOverdue, isEscalated, getDisplayStatus } from '../../utils/complaintHelpers';
import { formatIssueType, formatDateTime, formatComplaintRef } from '../../utils/formatters';
import { ISSUE_TYPE_LABELS } from '../../utils/constants';
import './AuthorityComplaintsPage.css';

// Filters on the stored backend status. 'submitted' includes complaints
// returned for rework, which are shown with their own badge.
const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'pending_verification', label: 'Pending verification' },
  { value: 'resolved', label: 'Resolved' },
];

const ISSUE_TYPE_OPTIONS = [
  { value: 'all', label: 'All issue types' },
  ...Object.entries(ISSUE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const ESCALATION_OPTIONS = [
  { value: 'all', label: 'All complaints' },
  { value: 'escalated', label: 'Escalated only' },
  { value: 'not_escalated', label: 'Not escalated' },
];

const DEFAULT_FILTERS = { status: 'all', issueType: 'all', escalation: 'all', overdueOnly: false };

export function AuthorityComplaintsPage() {
  useDocumentTitle('Department Complaints');
  const { department } = useAuth();
  const [searchParams] = useSearchParams();

  const [complaints, setComplaints] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_FILTERS,
    escalation: searchParams.get('filter') === 'escalated' ? 'escalated' : 'all',
  }));

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

  const filteredComplaints = useMemo(() => {
    if (!complaints) return [];
    const query = search.trim().toLowerCase();

    return complaints.filter((complaint) => {
      if (filters.status !== 'all' && complaint.status !== filters.status) return false;
      if (filters.issueType !== 'all' && complaint.issueType !== filters.issueType) return false;
      if (filters.escalation === 'escalated' && !isEscalated(complaint)) return false;
      if (filters.escalation === 'not_escalated' && isEscalated(complaint)) return false;
      if (filters.overdueOnly && !isOverdue(complaint)) return false;

      if (query) {
        const haystack = [
          complaint._id,
          complaint.description,
          formatIssueType(complaint.issueType),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [complaints, filters, search]);

  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.issueType !== 'all' ||
    filters.escalation !== 'all' ||
    filters.overdueOnly ||
    search.trim() !== '';

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSearch('');
  };

  return (
    <PageContainer
      title="Department Complaints"
      subtitle={`Every complaint currently assigned to ${department}.`}
    >
      {isLoading && <LoadingState label="Loading department complaints…" />}

      {!isLoading && error && <ErrorState description={error} />}

      {!isLoading && !error && complaints && (
        <>
          <Card className="rn-filter-bar">
            <Input
              label="Search"
              placeholder="Search by ID, description, or issue type"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            />
            <Select
              label="Issue type"
              options={ISSUE_TYPE_OPTIONS}
              value={filters.issueType}
              onChange={(event) => setFilters((prev) => ({ ...prev, issueType: event.target.value }))}
            />
            <Select
              label="Escalation"
              options={ESCALATION_OPTIONS}
              value={filters.escalation}
              onChange={(event) => setFilters((prev) => ({ ...prev, escalation: event.target.value }))}
            />
            <label className="rn-filter-bar__checkbox">
              <input
                type="checkbox"
                checked={filters.overdueOnly}
                onChange={(event) => setFilters((prev) => ({ ...prev, overdueOnly: event.target.checked }))}
              />
              Overdue only
            </label>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </Card>

          {complaints.length === 0 ? (
            <EmptyState
              icon="✓"
              title="No complaints assigned yet"
              description={`No complaints have been routed to ${department} so far.`}
            />
          ) : filteredComplaints.length === 0 ? (
            <EmptyState
              icon="⌕"
              title="No complaints match your filters"
              description="Try adjusting or clearing the filters above."
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="rn-table-wrapper">
              <table className="rn-table">
                <thead>
                  <tr>
                    <th scope="col">Complaint</th>
                    <th scope="col">Issue Type</th>
                    <th scope="col">Status</th>
                    <th scope="col">SLA</th>
                    <th scope="col">Escalation</th>
                    <th scope="col">Submitted</th>
                    <th scope="col">
                      <span className="rn-visually-hidden">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredComplaints.map((complaint) => (
                    <tr key={complaint._id}>
                      <td data-label="Complaint">
                        <span className="rn-table__ref">{formatComplaintRef(complaint._id)}</span>
                        <span className="rn-table__description">{complaint.description}</span>
                      </td>
                      <td data-label="Issue Type">
                        <Badge variant="neutral">{formatIssueType(complaint.issueType)}</Badge>
                      </td>
                      <td data-label="Status">
                        <Badge variant={getDisplayStatus(complaint).variant}>
                          {getDisplayStatus(complaint).label}
                        </Badge>
                      </td>
                      <td data-label="SLA">
                        <SlaIndicator complaint={complaint} />
                      </td>
                      <td data-label="Escalation">
                        <EscalationIndicator complaint={complaint} />
                      </td>
                      <td data-label="Submitted">{formatDateTime(complaint.createdAt)}</td>
                      <td data-label="Action" className="rn-table__action">
                        <Link to={`/authority/complaints/${complaint._id}`} className="rn-table__link">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
