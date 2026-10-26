import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Logo } from '../brand/Logo';
import { Button } from '../ui';
import { NotificationBell } from '../notifications/NotificationBell';
import { getInitials } from '../../utils/formatters';
import { getHomeRoute } from '../../utils/roleHome';
import './Header.css';

const CITIZEN_LINKS = [
  { to: '/citizen/dashboard', label: 'Dashboard' },
  { to: '/citizen/report', label: 'Report an Issue' },
  { to: '/citizen/complaints', label: 'My Complaints' },
];

const AUTHORITY_LINKS = [
  { to: '/authority/dashboard', label: 'Dashboard' },
  { to: '/authority/complaints', label: 'Complaints' },
  { to: '/authority/complaints?filter=escalated', label: 'Escalated' },
];

const MONITOR_LINKS = [
  { to: '/monitor/pending', label: 'Pending Verification' },
  { to: '/monitor/complaints', label: 'All Complaints' },
];

export function Header() {
  const { isAuthenticated, user, role, department, logout } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const links =
    role === 'department'
      ? AUTHORITY_LINKS
      : role === 'monitor'
        ? MONITOR_LINKS
        : role === 'citizen'
          ? CITIZEN_LINKS
          : [];
  const homeLink = isAuthenticated ? getHomeRoute(role) : '/';

  const handleLogout = () => {
    logout();
    setIsMenuOpen(false);
    navigate('/');
  };

  return (
    <header className="rn-header">
      <div className="rn-header__inner">
        <Link to={homeLink} className="rn-header__brand">
          <Logo size="sm" />
          {role === 'department' && <span className="rn-header__portal-label">Authority Portal</span>}
          {role === 'monitor' && <span className="rn-header__portal-label">Monitor Portal</span>}
          {role === 'citizen' && <span className="rn-header__portal-label">Citizen Portal</span>}
        </Link>

        {links.length > 0 && (
          <nav className="rn-header__nav" aria-label="Primary">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `rn-header__link${isActive ? ' rn-header__link--active' : ''}`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="rn-header__actions">
          {isAuthenticated ? (
            <div className="rn-header__user">
              <NotificationBell />
              <span className="rn-header__avatar" aria-hidden="true">
                {getInitials(user?.name)}
              </span>
              <span className="rn-header__user-info">
                <span className="rn-header__user-name">{user?.name}</span>
                {department && <span className="rn-header__user-dept">{department}</span>}
              </span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Sign out
              </Button>
            </div>
          ) : (
            <div className="rn-header__auth-actions">
              <Button variant="ghost" size="sm" to="/login">
                Sign in
              </Button>
              <Button variant="primary" size="sm" to="/register">
                Get started
              </Button>
            </div>
          )}

          {links.length > 0 && (
            <button
              type="button"
              className="rn-header__menu-toggle"
              aria-expanded={isMenuOpen}
              aria-label="Toggle navigation menu"
              onClick={() => setIsMenuOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>
          )}
        </div>
      </div>

      {links.length > 0 && isMenuOpen && (
        <nav className="rn-header__mobile-nav" aria-label="Primary mobile">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `rn-header__link${isActive ? ' rn-header__link--active' : ''}`}
              onClick={() => setIsMenuOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}
