import { ISSUE_TYPE_LABELS, STATUS_LABELS } from './constants';

export const formatIssueType = (issueType) => ISSUE_TYPE_LABELS[issueType] || 'Unclassified';

export const formatStatus = (status) => STATUS_LABELS[status] || status || 'Unknown';

export const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export const formatRelativeToNow = (value) => {
  if (!value) return '—';
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return '—';

  const diffMs = target - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const absMinutes = Math.abs(diffMinutes);

  if (absMinutes < 60) {
    return diffMinutes >= 0 ? `in ${absMinutes} min` : `${absMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);
  if (absHours < 48) {
    return diffHours >= 0 ? `in ${absHours} hr` : `${absHours} hr ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return diffDays >= 0 ? `in ${diffDays} days` : `${Math.abs(diffDays)} days ago`;
};

export const formatComplaintRef = (id) => `#${id.slice(-6).toUpperCase()}`;

export const getInitials = (name) => {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
};
