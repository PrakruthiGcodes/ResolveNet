import './Card.css';

export function Card({ children, className = '', padded = true, as: Component = 'div', ...rest }) {
  const classes = ['rn-card', padded ? 'rn-card--padded' : '', className].filter(Boolean).join(' ');
  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  );
}

export function CardHeader({ title, subtitle, actions }) {
  return (
    <div className="rn-card__header">
      <div>
        <h3 className="rn-card__title">{title}</h3>
        {subtitle && <p className="rn-card__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="rn-card__actions">{actions}</div>}
    </div>
  );
}
