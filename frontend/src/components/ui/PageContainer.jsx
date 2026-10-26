import './PageContainer.css';

export function PageContainer({ eyebrow, title, subtitle, actions, children, className = '' }) {
  return (
    <div className={`rn-page ${className}`}>
      {(title || actions) && (
        <div className="rn-page__header">
          <div>
            {eyebrow && <span className="rn-page__eyebrow">{eyebrow}</span>}
            {title && <h1 className="rn-page__title">{title}</h1>}
            {subtitle && <p className="rn-page__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="rn-page__actions">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
