import apiClient from './apiClient';

// Matches backend/routes/complaintRoutes.js exactly:
//   POST  /api/complaints                          -> { complaint }
//   GET   /api/complaints                           -> { complaints }        (citizen's own)
//   GET   /api/complaints/:id                        -> { complaint }         (citizen's own)
//   GET   /api/complaints/department                 -> { complaints }        (department role only)
//   PATCH /api/complaints/department/:id/status       -> { complaint }         (department role only)
//
// A full complaint document includes: _id, user, description, location,
// issueType, confidence, image, imageClassification, status, department,
// dueAt, escalationLevel, escalatedAt, createdAt, updatedAt. The
// department-scoped list endpoint returns a narrower field set (no user,
// image, imageClassification, location) - see backend/controllers/
// complaintController.js's DEPARTMENT_COMPLAINT_FIELDS.

export const createComplaint = ({ description, location, imageFile }) => {
  const formData = new FormData();
  formData.append('description', description);
  if (location) {
    formData.append('location', JSON.stringify(location));
  }
  if (imageFile) {
    formData.append('image', imageFile);
  }

  return apiClient
    .post('/complaints', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data);
};

export const getMyComplaints = () => apiClient.get('/complaints').then((res) => res.data);

export const getComplaintById = (id) => apiClient.get(`/complaints/${id}`).then((res) => res.data);

// Citizen-only, owner-only. Matches backend
// PATCH /api/complaints/:id/confirm-issue-type -> { complaint }.
// Used for complaints saved as 'needs_confirmation' because the photo could not
// be classified. issueType must be one of the ISSUE_TYPE_LABELS keys.
export const confirmComplaintIssueType = (id, issueType) =>
  apiClient.patch(`/complaints/${id}/confirm-issue-type`, { issueType }).then((res) => res.data);

export const getDepartmentComplaints = () =>
  apiClient.get('/complaints/department').then((res) => res.data);

// Department sends status 'resolved' to mean "work done, submit for
// verification". The backend moves it to pending_verification.
export const updateComplaintStatus = (id, status) =>
  apiClient.patch(`/complaints/department/${id}/status`, { status }).then((res) => res.data);

// Department marks an assigned, submitted complaint as 'in_progress' when
// work starts. Matches PATCH /api/complaints/department/:id/work-status.
export const updateComplaintWorkStatus = (id, workStatus) =>
  apiClient.patch(`/complaints/department/${id}/work-status`, { workStatus }).then((res) => res.data);

// Matches backend/routes/complaintRoutes.js (monitor role only):
//   GET   /api/complaints/monitor                      -> { complaints }  (all statuses, read-only)
//   GET   /api/complaints/monitor/pending-verification -> { complaints }
//   PATCH /api/complaints/monitor/:id/review           -> { complaint }
// The pending list covers pending complaints from every department. The
// all-complaints list is read-only and carries the recorded history.
export const getPendingVerificationComplaints = () =>
  apiClient.get('/complaints/monitor/pending-verification').then((res) => res.data);

export const getAllMonitorComplaints = () => apiClient.get('/complaints/monitor').then((res) => res.data);

// decision: 'approve' | 'reject'. reason is required by the backend when rejecting.
export const reviewComplaintCompletion = (id, decision, reason) =>
  apiClient
    .patch(`/complaints/monitor/${id}/review`, reason === undefined ? { decision } : { decision, reason })
    .then((res) => res.data);
