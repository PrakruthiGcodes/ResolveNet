import { Button, Card, Badge } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ISSUE_TYPE_LABELS } from '../../utils/constants';
import './LandingPage.css';

const STEPS = [
  {
    number: '01',
    title: 'Report',
    description: 'Submit a civic issue with a description and, optionally, a photo of the location.',
  },
  {
    number: '02',
    title: 'AI Classification',
    description:
      'Text and image AI models analyze the report and identify the issue type automatically.',
  },
  {
    number: '03',
    title: 'Department Routing',
    description:
      'The issue is routed to the responsible municipal department with a service-level deadline.',
  },
  {
    number: '04',
    title: 'Track & Escalate',
    description:
      'Track resolution status in real time. Unresolved issues are automatically escalated past deadline.',
  },
];

const FEATURES = [
  {
    title: 'AI-Powered Classification',
    description:
      'A YOLO-based image model and a text classifier work together to identify the reported issue accurately.',
  },
  {
    title: 'Automatic Department Routing',
    description: 'Every issue type maps to the municipal department responsible for resolving it.',
  },
  {
    title: 'SLA-Backed Accountability',
    description: 'Each issue type carries a defined resolution deadline, tracked from the moment it is reported.',
  },
  {
    title: 'Automatic Escalation',
    description:
      'A background monitoring system checks deadlines continuously and escalates unresolved issues without manual follow-up.',
  },
];

export function LandingPage() {
  useDocumentTitle('Home');
  const { isAuthenticated, role } = useAuth();

  // Calls to action adapt to who's actually looking at the page - a signed
  // in user should never be pointed back at Register/Login, and an
  // authority's primary action is their queue, not filing a report.
  const isAuthority = isAuthenticated && role === 'department';
  const primaryAction = !isAuthenticated
    ? { label: 'Report an Issue', to: '/register' }
    : isAuthority
      ? { label: 'Go to Dashboard', to: '/authority/dashboard' }
      : { label: 'Report an Issue', to: '/citizen/report' };
  const secondaryAction = !isAuthenticated
    ? { label: 'Sign In', to: '/login' }
    : isAuthority
      ? { label: 'View Department Complaints', to: '/authority/complaints' }
      : { label: 'View My Complaints', to: '/citizen/complaints' };

  return (
    <div className="rn-landing">
      <section className="rn-hero">
        <div className="rn-hero__inner">
          <span className="rn-hero__eyebrow">Civic Issue Reporting Platform</span>
          <h1 className="rn-hero__title">ResolveNet</h1>
          <p className="rn-hero__tagline">Report. Track. Resolve.</p>
          <p className="rn-hero__message">
            AI-powered civic issue reporting and automated resolution tracking. Report a problem in
            your neighborhood and let ResolveNet route it, time it, and hold the right department
            accountable.
          </p>
          <div className="rn-hero__actions">
            <Button size="lg" to={primaryAction.to}>
              {primaryAction.label}
            </Button>
            <Button size="lg" variant="outline" to={secondaryAction.to}>
              {secondaryAction.label}
            </Button>
          </div>
          <ul className="rn-hero__trust-strip">
            <li>Automated classification</li>
            <li>Department routing</li>
            <li>SLA-backed accountability</li>
            <li>Automatic escalation</li>
          </ul>
        </div>
      </section>

      <section className="rn-section">
        <div className="rn-section__inner">
          <h2 className="rn-section__title">How it works</h2>
          <p className="rn-section__subtitle">
            From report to resolution, every step is tracked and time-bound.
          </p>
          <div className="rn-steps">
            {STEPS.map((step) => (
              <Card key={step.number} className="rn-step-card">
                <span className="rn-step-card__number">{step.number}</span>
                <h3 className="rn-step-card__title">{step.title}</h3>
                <p className="rn-step-card__description">{step.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="rn-section rn-section--muted">
        <div className="rn-section__inner">
          <h2 className="rn-section__title">Built for trust and accountability</h2>
          <p className="rn-section__subtitle">
            A platform designed around reliability, transparency, and measurable public-service
            outcomes.
          </p>
          <div className="rn-features">
            {FEATURES.map((feature) => (
              <Card key={feature.title} className="rn-feature-card">
                <h3 className="rn-feature-card__title">{feature.title}</h3>
                <p className="rn-feature-card__description">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="rn-section">
        <div className="rn-section__inner">
          <h2 className="rn-section__title">Issue types recognized today</h2>
          <p className="rn-section__subtitle">
            ResolveNet currently classifies and routes the following civic issue categories.
          </p>
          <div className="rn-issue-badges">
            {Object.values(ISSUE_TYPE_LABELS).map((label) => (
              <Badge key={label} variant="neutral">
                {label}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* Signed-in users already have adapted actions in the hero above -
          this closing pitch is only for a first-time visitor. */}
      {!isAuthenticated && (
        <section className="rn-cta">
          <div className="rn-cta__inner">
            <h2 className="rn-cta__title">Ready to report an issue in your area?</h2>
            <p className="rn-cta__subtitle">Create a free account and submit your first report in minutes.</p>
            <Button size="lg" to="/register">
              Get Started
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
