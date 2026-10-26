import './Logo.css';

export function Logo({ size = 'md', showWordmark = true }) {
  return (
    <span className={`rn-logo rn-logo--${size}`}>
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className="rn-logo__mark">
        <rect width="32" height="32" rx="8" fill="var(--rn-color-primary-800)" />
        <path
          d="M16 6L25 10V15.2C25 20.8 21.4 24.9 16 26.5C10.6 24.9 7 20.8 7 15.2V10L16 6Z"
          fill="#fff"
        />
        <path
          d="M12.3 16.4L14.8 18.9L19.8 13.4"
          stroke="var(--rn-color-primary-800)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showWordmark && <span className="rn-logo__wordmark">ResolveNet</span>}
    </span>
  );
}
