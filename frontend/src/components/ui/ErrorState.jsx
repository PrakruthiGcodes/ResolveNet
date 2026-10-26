
import './StateDisplays.css';
import { Button } from './Button';

export function ErrorState({ title = 'Something went wrong', description, onRetry }) {
  return (
    <div className="rn-state rn-state--error" role="alert">
      <span className="rn-state__icon" aria-hidden="true">
        ⚠
      </span>
      <h3 className="rn-state__title">{title}</h3>
      {description && <p className="rn-state__text">{description}</p>}
      {onRetry && (
        <div className="rn-state__action">
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
