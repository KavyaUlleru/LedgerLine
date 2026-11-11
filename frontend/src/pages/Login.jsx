import React, { useState } from 'react';
import { loginUser, resetUserPassword } from '../services/api';

export default function Login({ onLoginSuccess, onSwitchToRegister }) {
  // Sign-in state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Forgot password state
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetPhone, setResetPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
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

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!resetEmail || !resetEmail.trim()) {
      setError('Please enter your registered email address.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation password do not match.');
      return;
    }

    setResetLoading(true);

    try {
      const res = await resetUserPassword({
        email: resetEmail.trim(),
        phone: resetPhone ? resetPhone.trim() : null,
        newPassword: newPassword.trim(),
      });

      setSuccessMsg(res.message || 'Password reset successfully! Please sign in with your new password.');
      setEmail(resetEmail);
      setIsForgotPassword(false);
      setNewPassword('');
      setConfirmPassword('');
      setResetPhone('');
    } catch (err) {
      setError(err.message || 'Failed to reset password. Please check your details.');
    } finally {
      setResetLoading(false);
    }
  };

  // Forgot Password View
  if (isForgotPassword) {
    return (
      <div className="auth-card">
        <div className="auth-header">
          <h2>Reset Your Password</h2>
          <p>Enter your registered email and mobile number to set a new password.</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleResetSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="reset-email">Registered Email Address</label>
            <input
              id="reset-email"
              type="email"
              required
              placeholder="e.g., user@example.com"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="reset-phone">
              Registered Mobile Number <span className="text-muted-xs">(Optional verification)</span>
            </label>
            <input
              id="reset-phone"
              type="tel"
              placeholder="e.g., +91 9876543210"
              value={resetPhone}
              onChange={(e) => setResetPhone(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="reset-new-pass">New Password (minimum 6 characters)</label>
            <input
              id="reset-new-pass"
              type="password"
              required
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="reset-confirm-pass">Confirm New Password</label>
            <input
              id="reset-confirm-pass"
              type="password"
              required
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={resetLoading}>
            {resetLoading ? 'Resetting Password...' : 'Reset Password'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Remember your password?{' '}
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setIsForgotPassword(false);
                setError('');
              }}
            >
              Back to Sign In
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Standard Sign In View
  return (
    <div className="auth-card">
      <div className="auth-header">
        <h2>Sign In to Your Account</h2>
        <p>Access your accounts, transfer funds safely, and view audit history.</p>
      </div>

      {successMsg && <div className="alert alert-success">{successMsg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleLoginSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            required
            placeholder="e.g., user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="form-group">
          <div className="label-with-action">
            <label htmlFor="password">Password</label>
            <button
              type="button"
              className="btn-link-forgot"
              onClick={() => {
                setIsForgotPassword(true);
                setResetEmail(email);
                setError('');
                setSuccessMsg('');
              }}
            >
              Forgot Password?
            </button>
          </div>
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



