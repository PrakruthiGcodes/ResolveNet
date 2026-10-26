import { useId } from 'react';
import './FormField.css';

export function Input({ label, hint, error, id, required, className = '', ...rest }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={`rn-field ${className}`}>
      <label htmlFor={inputId} className="rn-field__label">
        {label}
        {required && (
          <span aria-hidden="true" className="rn-field__required">
            {' '}
            *
          </span>
        )}
      </label>
      <input
        id={inputId}
        className={`rn-field__input${error ? ' rn-field__input--error' : ''}`}
        aria-invalid={Boolean(error)}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        aria-required={required || undefined}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="rn-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="rn-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
