import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LoadingState } from '../ui';
import { getHomeRoute } from '../../utils/roleHome';

// This is a UX convenience that hides/redirects routes in the browser. It
// is not a security boundary - the backend's protect/requireRole
// middleware is the actual authorization enforcement, and every API call
// is validated there regardless of what this component does.
export function ProtectedRoute({ allowedRoles }) {
  const { isAuthenticated, isInitializing, role } = useAuth();
  const location = useLocation();

  if (isInitializing) {
    return <LoadingState label="Checking your session…" fullPage />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={getHomeRoute(role)} replace />;
  }

  return <Outlet />;
}
