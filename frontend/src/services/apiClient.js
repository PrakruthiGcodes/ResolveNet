import axios from 'axios';
import { AUTH_TOKEN_STORAGE_KEY } from '../utils/constants';

// Single source of truth for the backend origin. Everything that needs to
// reach the API (including building a full URL for an uploaded image) goes
// through this constant rather than a hard-coded string.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export const UNAUTHORIZED_EVENT = 'resolvenet:unauthorized';

const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api`,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Dev only: log where the request failed and what the server said. The
    // request body is deliberately never logged, so passwords stay out of the console.
    if (import.meta.env.DEV) {
      console.error(
        `[api] ${error.config?.method?.toUpperCase()} ${error.config?.url} failed:`,
        error.response ? `HTTP ${error.response.status}` : 'no response (network or CORS)',
        error.response?.data?.message ?? error.message
      );
    }
    if (error.response?.status === 401) {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      // AuthContext listens for this to clear in-memory user state without
      // this module needing to import React or hold app state itself.
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  }
);

// Backend error responses always take the shape { message: string }
// (see backend/controllers/*.js) - this pulls that out consistently, with a
// safe fallback for network failures that never reached the server.
export const getErrorMessage = (error, fallback = 'Something went wrong. Please try again.') =>
  error?.response?.data?.message || fallback;

export default apiClient;
