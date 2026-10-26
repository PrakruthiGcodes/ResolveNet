import { useCallback, useEffect, useRef, useState } from 'react';
import { PageContainer, Card, CardHeader, Badge, Button, Alert, Textarea, LoadingState, ErrorState, EmptyState } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getPendingVerificationComplaints, reviewComplaintCompletion } from '../../services/complaintService';
import { getErrorMessage } from '../../services/apiClient';
import { ComplaintHistory } from '../../components/complaints/ComplaintHistory';
import { ComplaintPhoto } from '../../components/complaints/ComplaintPhoto';
import { formatIssueType, formatDateTime, formatComplaintRef } from '../../utils/formatters';
import '../citizen/ComplaintDetailPage.css';
import './MonitorReviewPage.css';

// Backend limit for a rejection reason (backend/controllers/complaintController.js).
const REJECTION_REASON_MAX_LENGTH = 1000;

// Minimum gap between focus-triggered queue refreshes.
const SILENT_REFRESH_COOLDOWN_MS = 2000;

// The most recent earlier rejection, if this completion was returned before
// and resubmitted. verificationHistory is append-only on the backend.
const getPreviousRejection = (complaint) => {
  const history = complaint.verificationHistory ?? [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].action === 'rejected') return history[i];
  }
  return null;
};

export function MonitorReviewPage() {
  useDocumentTitle('Pending Verification');

  const [complaints, setComplaints] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Result of the last review action, shown above the list. A rejection
  // reason appears here after the complaint has left the queue, since the
  // backend has no monitor view of returned complaints.
  const [notice, setNotice] = useState(null);

  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [cardError, setCardError] = useState({ id: null, message: '' });

  // Guards against overlapping loads, and times the silent refreshes on focus.
  const isLoadingQueue = useRef(false);
  const lastSilentRefreshAt = useRef(0);

  // silent: refresh in the background without the loading state, so the list
  // and any open rejection form stay on screen. A failed silent refresh keeps
  // the current list.
  const loadComplaints = useCallback(async ({ silent = false } = {}) => {
    if (isLoadingQueue.current) return;
    isLoadingQueue.current = true;
    if (!silent) {
      setIsLoading(true);
      setLoadError('');
    }
    try {
      const data = await getPendingVerificationComplaints();
      setComplaints(data.complaints);
    } catch (err) {
      if (!silent) setLoadError(getErrorMessage(err, 'Unable to load complaints awaiting verification.'));
    } finally {
      isLoadingQueue.current = false;
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  // Returning to the tab or window can show a complaint that was decided
  // elsewhere, so reload the queue. Focus and visibility often fire together,
  // so a short cooldown skips the second one.
  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastSilentRefreshAt.current < SILENT_REFRESH_COOLDOWN_MS) return;
      lastSilentRefreshAt.current = now;
      loadComplaints({ silent: true });
    };

    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [loadComplaints]);

  const removeFromQueue = (id) => {
    setComplaints((prev) => prev.filter((c) => c._id !== id));
  };

  const handleApprove = async (complaint) => {
    setBusyId(complaint._id);
    setCardError({ id: null, message: '' });
    setNotice(null);
    try {
      await reviewComplaintCompletion(complaint._id, 'approve');
      removeFromQueue(complaint._id);
      setNotice({ variant: 'success', text: `Approved ${formatComplaintRef(complaint._id)}. It is now resolved.` });
    } catch (err) {
      handleReviewError(complaint._id, err);
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (complaint) => {
    setRejectingId(complaint._id);
    setRejectReason('');
    setRejectError('');
    setCardError({ id: null, message: '' });
    setNotice(null);
  };

  const closeReject = () => {
    setRejectingId(null);
    setRejectReason('');
    setRejectError('');
  };

  const handleReject = async (complaint) => {
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError('Enter a reason so the department knows what to fix.');
      return;
    }

    setBusyId(complaint._id);
    setRejectError('');
    try {
      await reviewComplaintCompletion(complaint._id, 'reject', reason);
      removeFromQueue(complaint._id);
      closeReject();
      setNotice({
        variant: 'warning',
        text: `Returned ${formatComplaintRef(complaint._id)} to ${complaint.department} for rework. Reason: ${reason}`,
      });
    } catch (err) {
      setRejectError(getErrorMessage(err, 'Unable to return this complaint. Please try again.'));
      handleReviewError(complaint._id, err, { quiet: true });
    } finally {
      setBusyId(null);
    }
  };

  // A 409 means the complaint is no longer pending (another monitor acted, or
  // it was already decided). Reload the queue so the list matches the backend.
  const handleReviewError = (id, err, { quiet = false } = {}) => {
    if (err?.response?.status === 409) {
      setNotice({ variant: 'warning', text: 'This complaint was already reviewed. The list has been refreshed.' });
      loadComplaints();
      return;
    }
    if (!quiet) {
      setCardError({ id, message: getErrorMessage(err, 'Unable to complete this review. Please try again.') });
    }
  };

  return (
    <PageContainer
      eyebrow="ResolveNet — Monitor Portal"
      title="Pending Verification"
      subtitle="Completed work from every department, waiting for a monitor decision. Approving resolves the complaint. Returning it sends it back to the department with your reason."
      actions={
        <Button variant="outline" onClick={() => loadComplaints()} isLoading={isLoading}>
          Refresh
        </Button>
      }
    >
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}

      {isLoading && <LoadingState label="Loading complaints awaiting verification…" />}

      {!isLoading && loadError && <ErrorState description={loadError} onRetry={() => loadComplaints()} />}

      {!isLoading && !loadError && complaints.length === 0 && (
        <EmptyState
          icon="✓"
          title="Nothing awaiting verification"
          description="No completed work is waiting for a monitor decision right now."
        />
      )}

      {!isLoading && !loadError && complaints.length > 0 && (
        <div className="rn-monitor-list">
          {complaints.map((complaint) => {
            const previousRejection = getPreviousRejection(complaint);
            const isBusy = busyId === complaint._id;
            const isRejecting = rejectingId === complaint._id;

            return (
              <Card key={complaint._id} className="rn-monitor-card">
                <CardHeader
                  title={`Complaint ${formatComplaintRef(complaint._id)}`}
                  subtitle={`Submitted for verification ${formatDateTime(complaint.verification?.submittedAt)}`}
                />

                <div className="rn-detail-badges">
                  <Badge variant="neutral">{formatIssueType(complaint.issueType)}</Badge>
                  <Badge variant="info">{complaint.department}</Badge>
                  {complaint.escalationLevel >= 1 && <Badge variant="danger">Escalated</Badge>}
                </div>

                <p className="rn-detail-description">{complaint.description}</p>

                <ComplaintPhoto complaintId={complaint._id} hasImage={Boolean(complaint.image?.url)} />

                {previousRejection && (
                  <Alert variant="warning">
                    Previously returned on {formatDateTime(previousRejection.at)}: {previousRejection.reason}
                  </Alert>
                )}

                <ComplaintHistory complaint={complaint} />

                {cardError.id === complaint._id && <Alert variant="error">{cardError.message}</Alert>}

                {isRejecting ? (
                  <div className="rn-monitor-card__reject">
                    <Textarea
                      label="Reason for returning this work"
                      required
                      rows={3}
                      maxLength={REJECTION_REASON_MAX_LENGTH}
                      hint={`Shown to the ${complaint.department} so they know what to fix. Up to ${REJECTION_REASON_MAX_LENGTH} characters.`}
                      error={rejectError || undefined}
                      value={rejectReason}
                      onChange={(event) => {
                        setRejectReason(event.target.value);
                        if (rejectError) setRejectError('');
                      }}
                    />
                    <div className="rn-monitor-card__actions">
                      <Button variant="danger" onClick={() => handleReject(complaint)} isLoading={isBusy}>
                        Return for Rework
                      </Button>
                      <Button variant="ghost" onClick={closeReject} disabled={isBusy}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rn-monitor-card__actions">
                    <Button onClick={() => handleApprove(complaint)} isLoading={isBusy} disabled={busyId !== null && !isBusy}>
                      Approve Completion
                    </Button>
                    <Button variant="outline" onClick={() => openReject(complaint)} disabled={busyId !== null}>
                      Return for Rework
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
