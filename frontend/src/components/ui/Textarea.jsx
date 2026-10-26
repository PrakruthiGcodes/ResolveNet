import { useId } from 'react';
import './FormField.css';

export function Textarea({ label, hint, error, id, required, className = '', rows = 5, ...rest }) {
  const generatedId = useId();
  const textareaId = id || generatedId;
  const hintId = hint ? `${textareaId}-hint` : undefined;
  const errorId = error ? `${textareaId}-error` : undefined;

  return (
    <div className={`rn-field ${className}`}>
      <label htmlFor={textareaId} className="rn-field__label">
        {label}
        {required && (
          <span aria-hidden="true" className="rn-field__required">
            {' '}
            *
          </span>
        )}
      </label>
      <textarea
        id={textareaId}
        rows={rows}
        className={`rn-field__input rn-field__textarea${error ? ' rn-field__input--error' : ''}`}
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
