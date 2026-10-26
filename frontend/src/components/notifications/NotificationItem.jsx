import { formatDateTime } from '../../utils/formatters';
import './NotificationItem.css';

export function NotificationItem({ notification, onSelect }) {
  return (
    <li className={`rn-notification-item${notification.isRead ? '' : ' rn-notification-item--unread'}`}>
      <button type="button" className="rn-notification-item__button" onClick={() => onSelect(notification)}>
        <span className="rn-notification-item__indicator" aria-hidden="true" />
        <span className="rn-notification-item__content">
          <span className="rn-notification-item__title">{notification.title}</span>
          <span className="rn-notification-item__message">{notification.message}</span>
          <span className="rn-notification-item__time">{formatDateTime(notification.createdAt)}</span>
        </span>
      </button>
    </li>
  );
}
