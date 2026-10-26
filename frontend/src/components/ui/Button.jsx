import { Link } from 'react-router-dom';
import './Button.css';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  fullWidth = false,
  type = 'button',
  to,
  className = '',
  ...rest
}) {
  const classes = [
    'rn-button',
    `rn-button--${variant}`,
    `rn-button--${size}`,
    fullWidth ? 'rn-button--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {isLoading && <span className="rn-button__spinner" aria-hidden="true" />}
      <span className={isLoading ? 'rn-button__label--loading' : undefined}>{children}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} disabled={disabled || isLoading} {...rest}>
      {content}
    </button>
  );
}
