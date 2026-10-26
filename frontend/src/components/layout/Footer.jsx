import { Logo } from '../brand/Logo';
import './Footer.css';

export function Footer() {
  return (
    <footer className="rn-footer">
      <div className="rn-footer__inner">
        <Logo size="sm" />
        <p className="rn-footer__tagline">Report. Track. Resolve.</p>
        <p className="rn-footer__copy">
          © {new Date().getFullYear()} ResolveNet. AI-powered civic issue reporting and automated
          resolution tracking.
        </p>
      </div>
    </footer>
  );
}
