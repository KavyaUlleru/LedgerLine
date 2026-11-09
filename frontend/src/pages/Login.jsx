import React, { useState } from 'react';
import { loginUser } from '../services/api';

export default function Login({ onLoginSuccess, onSwitchToRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await loginUser(email, password);
      onLoginSuccess(data.token, data.user, data.accounts);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillQuickLogin = (quickEmail, quickPassword) => {
    setEmail(quickEmail);
    setPassword(quickPassword);
    setError('');
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h2>Sign In to Your Account</h2>
        <p>Access your accounts, transfer funds safely, and view audit history.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            required
            placeholder="e.g., alice@ledgerline.local"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Authenticating...' : 'Sign In'}
        </button>
      </form>

      {/* Quick Demo Login shortcuts for technical interviewers */}
      <div className="demo-shortcuts">
        <span className="demo-shortcuts-label">⚡ Quick Demo Logins:</span>
        <div className="demo-buttons">
          <button
            type="button"
            className="btn-demo"
            onClick={() => fillQuickLogin('alice@ledgerline.local', 'Alice123!')}
          >
            Alice (Account Holder)
          </button>
          <button
            type="button"
            className="btn-demo"
            onClick={() => fillQuickLogin('bob@ledgerline.local', 'Bob123!')}
          >
            Bob (Account Holder)
          </button>
          <button
            type="button"
            className="btn-demo"
            onClick={() => fillQuickLogin('admin@ledgerline.local', 'Admin123!')}
          >
            System Admin
          </button>
          <button
            type="button"
            className="btn-demo"
            onClick={() => fillQuickLogin('auditor@ledgerline.local', 'Auditor123!')}
          >
            Lead Auditor
          </button>
        </div>
      </div>

      <div className="auth-footer">
        <p>
          Don't have an account yet?{' '}
          <button type="button" className="btn-link" onClick={onSwitchToRegister}>
            Register here
          </button>
        </p>
      </div>
    </div>
  );
}

