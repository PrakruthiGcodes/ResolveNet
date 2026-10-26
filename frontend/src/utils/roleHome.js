import { ROLES } from './constants';

// Each role's landing page. Used by login, the route guard, and the header
// logo. The backend enforces what each role can actually access.
export const getHomeRoute = (role) => {
  if (role === ROLES.DEPARTMENT) return '/authority/dashboard';
  if (role === ROLES.MONITOR) return '/monitor/pending';
  return '/citizen/dashboard';
};

// Where a notification about a complaint should open for this viewer. Each
// role can only reach its own complaint pages. Monitors have no complaint
// detail page, so they open the verification queue.
export const getNotificationRoute = (role, complaintId) => {
  if (role === ROLES.DEPARTMENT) return `/authority/complaints/${complaintId}`;
  if (role === ROLES.MONITOR) return '/monitor/pending';
  return `/citizen/complaints/${complaintId}`;
};
