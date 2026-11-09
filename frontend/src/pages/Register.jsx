import React, { useState } from 'react';
import { registerUser } from '../services/api';

export default function Register({ onRegisterSuccess, onSwitchToLogin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      const data = await registerUser(name, email, password);
      onRegisterSuccess(data.token, data.user, [data.account]);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h2>Open an Account</h2>
        <p>Register as a new account holder. An active bank account will be automatically provisioned.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="name">Full Name</label>
          <input
            id="name"
            type="text"
            required
            placeholder="e.g., Kavya Sharma"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="reg-email">Email Address</label>
          <input
            id="reg-email"
            type="email"
            required
            placeholder="e.g., kavya@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="reg-password">Password (minimum 6 characters)</label>
          <input
            id="reg-password"
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="onboarding-notice">
          🛡️ <strong>Security Guarantee:</strong> New registrations receive the <code>ACCOUNT_HOLDER</code> role and an initialized <code>STANDARD</code> account with ₹0.00 balance. All financial ledger entries are append-only.
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Creating Account...' : 'Register Account'}
        </button>
      </form>

      <div className="auth-footer">
        <p>
          Already have an account?{' '}
          <button type="button" className="btn-link" onClick={onSwitchToLogin}>
            Sign in here
          </button>
        </p>
      </div>
    </div>
  );
}

