import './StateDisplays.css';

export function LoadingState({ label = 'Loading…', fullPage = false }) {
  return (
    <div className={`rn-state ${fullPage ? 'rn-state--full-page' : ''}`} role="status" aria-live="polite">
      <span className="rn-state__spinner" aria-hidden="true" />
      <p className="rn-state__text">{label}</p>
    </div>
  );
}
