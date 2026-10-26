import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

import { PublicLayout } from './layouts/PublicLayout';
import { CitizenLayout } from './layouts/CitizenLayout';
import { AuthorityLayout } from './layouts/AuthorityLayout';
import { MonitorLayout } from './layouts/MonitorLayout';

import { LandingPage } from './pages/public/LandingPage';
import { LoginPage } from './pages/public/LoginPage';
import { RegisterPage } from './pages/public/RegisterPage';
import { NotFoundPage } from './pages/public/NotFoundPage';

import { CitizenDashboardPage } from './pages/citizen/CitizenDashboardPage';
import { ReportComplaintPage } from './pages/citizen/ReportComplaintPage';
import { ComplaintsListPage } from './pages/citizen/ComplaintsListPage';
import { ComplaintDetailPage } from './pages/citizen/ComplaintDetailPage';

import { AuthorityDashboardPage } from './pages/authority/AuthorityDashboardPage';
import { AuthorityComplaintsPage } from './pages/authority/AuthorityComplaintsPage';
import { AuthorityComplaintDetailPage } from './pages/authority/AuthorityComplaintDetailPage';

import { MonitorReviewPage } from './pages/monitor/MonitorReviewPage';
import { MonitorComplaintsPage } from './pages/monitor/MonitorComplaintsPage';

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            {/* Citizen (role: citizen only) */}
            <Route element={<ProtectedRoute allowedRoles={['citizen']} />}>
              <Route element={<CitizenLayout />}>
                <Route path="/citizen/dashboard" element={<CitizenDashboardPage />} />
                <Route path="/citizen/report" element={<ReportComplaintPage />} />
                <Route path="/citizen/complaints" element={<ComplaintsListPage />} />
                <Route path="/citizen/complaints/:id" element={<ComplaintDetailPage />} />
              </Route>
            </Route>

            {/* Authority (role: department only) */}
            <Route element={<ProtectedRoute allowedRoles={['department']} />}>
              <Route element={<AuthorityLayout />}>
                <Route path="/authority/dashboard" element={<AuthorityDashboardPage />} />
                <Route path="/authority/complaints" element={<AuthorityComplaintsPage />} />
                <Route path="/authority/complaints/:id" element={<AuthorityComplaintDetailPage />} />
              </Route>
            </Route>

            {/* Monitor (role: monitor only) */}
            <Route element={<ProtectedRoute allowedRoles={['monitor']} />}>
              <Route element={<MonitorLayout />}>
                <Route path="/monitor/pending" element={<MonitorReviewPage />} />
                <Route path="/monitor/complaints" element={<MonitorComplaintsPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
