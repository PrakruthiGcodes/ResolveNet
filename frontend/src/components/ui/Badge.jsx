import './Badge.css';

export function Badge({ children, variant = 'neutral', className = '' }) {
  return <span className={`rn-badge rn-badge--${variant} ${className}`}>{children}</span>;
}
