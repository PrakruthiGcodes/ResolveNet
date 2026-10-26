import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Card, Button, Input, Alert } from '../../components/ui';
import { Logo } from '../../components/brand/Logo';
import { useAuth } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../services/apiClient';
import { getHomeRoute } from '../../utils/roleHome';
import './AuthPages.css';

export function LoginPage() {
  useDocumentTitle('Sign In');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const user = await login(formData);
      const redirectTo = location.state?.from?.pathname || getHomeRoute(user.role);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to sign in. Please check your credentials.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rn-auth">
      <Card className="rn-auth__card">
        <div className="rn-auth__header">
          <Logo />
          <h1 className="rn-auth__title">Sign in to your account</h1>
          <p className="rn-auth__subtitle">Report new issues and track the status of your complaints.</p>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <form className="rn-auth__form" onSubmit={handleSubmit} noValidate>
          <Input
            label="Email address"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={formData.email}
            onChange={handleChange}
          />
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={formData.password}
            onChange={handleChange}
          />
          <Button type="submit" fullWidth isLoading={isSubmitting}>
            Sign in
          </Button>
        </form>

        <p className="rn-auth__footer">
          Don&rsquo;t have an account? <Link to="/register">Create one</Link>
        </p>
      </Card>
    </div>
  );
}
