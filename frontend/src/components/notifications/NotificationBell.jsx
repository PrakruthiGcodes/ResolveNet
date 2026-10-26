import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useClickOutside } from '../../hooks/useClickOutside';
import { getNotificationRoute } from '../../utils/roleHome';
import { LoadingState, EmptyState, ErrorState } from '../ui';
import { NotificationItem } from './NotificationItem';
import './NotificationBell.css';

export function NotificationBell() {
  const { notifications, unreadCount, isLoading, error, refresh, markAsRead, markAllAsRead } = useNotifications();
  const { role } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  useClickOutside(containerRef, () => setIsOpen(false), isOpen);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) refresh();
  };

  const handleSelect = async (notification) => {
    if (!notification.isRead) {
      await markAsRead(notification._id);
    }
    setIsOpen(false);
    // The complaint id is the same for every recipient, so the viewer's role
    // decides which page it opens. Each role can reach only its own pages.
    if (notification.complaint) {
      navigate(getNotificationRoute(role, notification.complaint));
    }
  };

  return (
    <div className="rn-notification-bell" ref={containerRef}>
      <button
        type="button"
        className="rn-notification-bell__trigger"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="rn-notification-bell__badge" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="rn-notification-panel" aria-label="Notifications">
          <div className="rn-notification-panel__header">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="rn-notification-panel__mark-all" onClick={markAllAsRead}>
                Mark all as read
              </button>
            )}
          </div>

          <div className="rn-notification-panel__body">
            {isLoading && <LoadingState label="Loading notifications…" />}
            {!isLoading && error && <ErrorState description={error} onRetry={refresh} />}
            {!isLoading && !error && notifications.length === 0 && (
              <EmptyState
                title="No notifications yet"
                description="Updates about your complaints will appear here."
              />
            )}
            {!isLoading && !error && notifications.length > 0 && (
              <ul className="rn-notification-list">
                {notifications.map((notification) => (
                  <NotificationItem key={notification._id} notification={notification} onSelect={handleSelect} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path
        d="M12 4a5 5 0 00-5 5v3.2c0 .5-.16.98-.46 1.38L5 15.5h14l-1.54-2.92A2.5 2.5 0 0117 11.2V9a5 5 0 00-5-5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9.5 18a2.5 2.5 0 005 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
