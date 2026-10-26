import './Alert.css';

export function Alert({ variant = 'info', children }) {
  return (
    <div className={`rn-alert rn-alert--${variant}`} role={variant === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
