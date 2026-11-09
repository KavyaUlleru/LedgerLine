import React from 'react';

export default function Navbar({ user, onLogout }) {
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
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="brand-logo">⚡</span>
        <div>
          <h1 className="brand-title">LedgerLine</h1>
          <span className="brand-subtitle">Financial Transaction Management</span>
        </div>
      </div>

      <div className="navbar-actions">
        {user ? (
          <div className="user-profile-menu">
            <div className="user-info">
              <span className="user-name">{user.name}</span>
              <span className={`role-badge ${getRoleBadgeClass(user.role)}`}>
                {user.role}
              </span>
            </div>
            <button className="btn-logout" onClick={onLogout}>
              Logout
            </button>
          </div>
        ) : (
          <div className="system-status">
            <span className="status-dot"></span>
            <span className="status-text">System Online</span>
          </div>
        )}
      </div>
    </nav>
  );
}

