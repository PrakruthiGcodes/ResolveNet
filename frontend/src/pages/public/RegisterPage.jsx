import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Button, Input, Alert } from '../../components/ui';
import { Logo } from '../../components/brand/Logo';
import { useAuth } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../services/apiClient';
import './AuthPages.css';

export function RegisterPage() {
  useDocumentTitle('Create Account');
  const { register } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register({ name: formData.name, email: formData.email, password: formData.password });
      navigate('/citizen/dashboard', { replace: true });
    } catch (err) {
      // No response at all means the request never reached the API (backend
      // down or unreachable), so say that instead of a generic failure.
      setError(
        err.response
          ? getErrorMessage(err, 'Unable to create your account. Please try again.')
          : 'Cannot reach the ResolveNet server. Make sure the backend is running and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rn-auth">
      <Card className="rn-auth__card">
        <div className="rn-auth__header">
          <Logo />
          <h1 className="rn-auth__title">Create your citizen account</h1>
          <p className="rn-auth__subtitle">
            Report civic issues and track them from submission through resolution.
          </p>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <form className="rn-auth__form" onSubmit={handleSubmit} noValidate>
          <Input
            label="Full name"
            name="name"
            autoComplete="name"
            required
            value={formData.name}
            onChange={handleChange}
          />
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
            autoComplete="new-password"
            required
            minLength={6}
            hint="At least 6 characters."
            value={formData.password}
            onChange={handleChange}
          />
          <Input
            label="Confirm password"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={formData.confirmPassword}
            onChange={handleChange}
          />
          <Button type="submit" fullWidth isLoading={isSubmitting}>
            Create account
          </Button>
        </form>

        <p className="rn-auth__footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
        <p className="rn-auth__note">
          Public registration creates a citizen account. Department authority accounts are provisioned
          separately by ResolveNet administrators.
        </p>
      </Card>
    </div>
  );
}
