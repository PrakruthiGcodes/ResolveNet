import './StateDisplays.css';

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="rn-state rn-state--empty">
      {icon && (
        <span className="rn-state__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <h3 className="rn-state__title">{title}</h3>
      {description && <p className="rn-state__text">{description}</p>}
      {action && <div className="rn-state__action">{action}</div>}
    </div>
  );
}
