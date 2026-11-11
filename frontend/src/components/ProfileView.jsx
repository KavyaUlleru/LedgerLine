import React, { useState } from 'react';
import { updateUserProfile, setAuthSession, getToken } from '../services/api';

export default function ProfileView({ user, onUserUpdated }) {
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);

    if (!name || name.trim().length < 2) {
      setFeedback({
        type: 'error',
        message: 'Name must be at least 2 characters long.',
      });
      return;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        setFeedback({
          type: 'error',
          message: 'New password must be at least 6 characters long.',
        });
        return;
      }
      if (newPassword !== confirmPassword) {
        setFeedback({
          type: 'error',
          message: 'New password and confirmation password do not match.',
        });
        return;
      }
    }

    setLoading(true);

    try {
      const payload = {
        name: name.trim(),
        phone: phone ? phone.trim() : null,
      };

      if (newPassword && newPassword.trim().length > 0) {
        payload.password = newPassword.trim();
      }

      const res = await updateUserProfile(payload);

      setFeedback({
        type: 'success',
        message: res.message || 'Profile updated successfully!',
      });

      // Clear password fields on success
      setNewPassword('');
      setConfirmPassword('');

      // Update session storage and app state
      const token = getToken();
      if (token && res.user) {
        setAuthSession(token, res.user);
      }

      if (onUserUpdated && res.user) {
        onUserUpdated(res.user);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to update profile. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'ADMIN':
        return 'badge-admin';
      case 'AUDITOR':
        return 'badge-auditor';
      default:
        return 'badge-account-holder';
    }
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h3>My Profile & Account Security</h3>
          <p>Manage your personal identification, mobile contact number, and login credentials.</p>
        </div>
      </div>

      <div className="card-form-wrapper" style={{ maxWidth: '640px' }}>
        {feedback && (
          <div className={`alert alert-${feedback.type}`}>
            <p><strong>{feedback.message}</strong></p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="financial-form">
          {/* Identity & Role Overview */}
          <div className="profile-identity-card">
            <div className="profile-avatar-large">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="profile-identity-info">
              <h4>{user?.name}</h4>
              <span className={`role-badge ${getRoleBadgeClass(user?.role)}`}>
                {user?.role}
              </span>
              <p className="profile-created-date">
                Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'recently'}
              </p>
            </div>
          </div>

          {/* Read-Only Email Field */}
          <div className="form-group">
            <label htmlFor="profile-email">
              Email Address <span className="text-muted-xs">(Fixed Account Identifier)</span>
            </label>
            <div className="input-locked-wrapper">
              <input
                id="profile-email"
                type="email"
                value={user?.email || ''}
                disabled
                className="input-locked"
              />
              <span className="locked-icon" title="Email address cannot be changed">🔒</span>
            </div>
            <span className="field-hint">
              For security, email addresses are immutable and bound to your account ledger history.
            </span>
          </div>

          {/* Editable Full Name */}
          <div className="form-group">
            <label htmlFor="profile-name">Full Legal Name</label>
            <input
              id="profile-name"
              type="text"
              required
              placeholder="Your full legal name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Editable Mobile Number */}
          <div className="form-group">
            <label htmlFor="profile-phone">Mobile / Contact Number</label>
            <input
              id="profile-phone"
              type="tel"
              placeholder="e.g., +91 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <span className="field-hint">
              Used for account security notifications and password recovery verification.
            </span>
          </div>

          <hr className="form-divider" />

          {/* Password Change Section */}
          <div className="password-update-section">
            <div className="section-title-sm">
              <h5>Change Password</h5>
              <span className="text-muted-xs">Leave blank if you do not want to change your password</span>
            </div>

            <div className="form-group">
              <label htmlFor="profile-new-pass">New Password</label>
              <input
                id="profile-new-pass"
                type="password"
                placeholder="•••••••• (minimum 6 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="profile-confirm-pass">Confirm New Password</label>
              <input
                id="profile-confirm-pass"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Saving Changes...' : 'Save Profile Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
