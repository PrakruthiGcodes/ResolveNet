// Presentation-only labels. The backend is the source of truth for every
// value here (issue types, statuses, roles) - this file only maps those
// exact backend strings to human-readable text, it never decides them.

export const ISSUE_TYPE_LABELS = {
  pothole: 'Pothole',
  garbage: 'Garbage',
  water_leakage: 'Water Leakage',
  streetlight: 'Streetlight',
  other: 'Other',
};

// Stored backend statuses (see backend/services/complaintStatus.js).
export const STATUS_LABELS = {
  needs_confirmation: 'Needs confirmation',
  submitted: 'Submitted',
  pending_verification: 'Pending verification',
  resolved: 'Resolved',
};

export const ROLES = {
  CITIZEN: 'citizen',
  DEPARTMENT: 'department',
  MONITOR: 'monitor',
  ADMIN: 'admin',
};

export const AUTH_TOKEN_STORAGE_KEY = 'resolvenet_token';

// Mirrors backend/middleware/uploadMiddleware.js exactly, for immediate
// client-side feedback only - the backend re-validates every upload
// regardless, so this can never weaken that check, only pre-empt it.
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
