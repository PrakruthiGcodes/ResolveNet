import apiClient from './apiClient';

// Matches backend/routes/notificationRoutes.js exactly:
//   GET   /api/notifications          -> { notifications, unreadCount }
//   PATCH /api/notifications/:id/read -> { notification }
//   PATCH /api/notifications/read-all -> { modifiedCount }

export const getMyNotifications = () => apiClient.get('/notifications').then((res) => res.data);

export const markNotificationRead = (id) =>
  apiClient.patch(`/notifications/${id}/read`).then((res) => res.data);

export const markAllNotificationsRead = () =>
  apiClient.patch('/notifications/read-all').then((res) => res.data);
