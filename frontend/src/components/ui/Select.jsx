import { useId } from 'react';
import './FormField.css';

export function Select({ label, hint, error, id, required, options, placeholder, className = '', ...rest }) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;

  return (
    <div className={`rn-field ${className}`}>
      <label htmlFor={selectId} className="rn-field__label">
        {label}
        {required && (
          <span aria-hidden="true" className="rn-field__required">
            {' '}
            *
          </span>
        )}
      </label>
      <select
        id={selectId}
        className={`rn-field__input rn-field__select${error ? ' rn-field__input--error' : ''}`}
        aria-invalid={Boolean(error)}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        aria-required={required || undefined}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
