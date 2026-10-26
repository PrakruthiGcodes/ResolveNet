import { Card } from './Card';
import './StatCard.css';

// Shared by both the citizen and authority dashboards - a single stat
// tile (value + label + a tone-colored accent) so the two dashboards read
// as the same design language rather than two different implementations.
export function StatCard({ label, value, tone = 'neutral' }) {
  return (
    <Card className={`rn-authority-stat rn-authority-stat--${tone}`}>
      <span className="rn-authority-stat__value">{value}</span>
      <span className="rn-authority-stat__label">{label}</span>
    </Card>
  );
}
