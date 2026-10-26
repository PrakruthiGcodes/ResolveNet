import apiClient from './apiClient';

// Matches backend/routes/authRoutes.js exactly:
//   POST /api/auth/register  -> { token, user }
//   POST /api/auth/login     -> { token, user }
//   GET  /api/auth/me        -> { user }
// user is { id, name, email, role, department } (department only set for
// role: 'department'). Registration always creates role: 'citizen' -
// the backend ignores any role/department sent from the client.

export const register = ({ name, email, password }) =>
  apiClient.post('/auth/register', { name, email, password }).then((res) => res.data);

export const login = ({ email, password }) =>
  apiClient.post('/auth/login', { email, password }).then((res) => res.data);

export const fetchCurrentUser = () => apiClient.get('/auth/me').then((res) => res.data);
