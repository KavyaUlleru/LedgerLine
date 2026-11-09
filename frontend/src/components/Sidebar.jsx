import React from 'react';

export default function Sidebar({ user, currentView, onSelectView, onLogout }) {
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

  const isStaff = user.role === 'ADMIN' || user.role === 'AUDITOR';
  const isAdmin = user.role === 'ADMIN';

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo">⚡</span>
        <div>
          <h2 className="sidebar-brand-name">LedgerLine</h2>
          <span className="sidebar-brand-tag">Audited Financial Ledger</span>
        </div>
      </div>

      {/* User Identity Mini Card */}
      <div className="sidebar-user-card">
        <div className="sidebar-avatar">
          {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
        </div>
        <div className="sidebar-user-details">
          <span className="sidebar-user-name">{user.name}</span>
          <span className={`role-badge ${getRoleBadgeClass(user.role)}`}>
            {user.role}
          </span>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">BANKING OPERATIONS</div>

        <button
          className={`sidebar-nav-item ${currentView === 'overview' ? 'active' : ''}`}
          onClick={() => onSelectView('overview')}
        >
          <span className="nav-icon">💳</span>
          <span>Accounts Overview</span>
        </button>

        {user.role !== 'AUDITOR' && (
          <>
            <button
              className={`sidebar-nav-item ${currentView === 'transfer' ? 'active' : ''}`}
              onClick={() => onSelectView('transfer')}
            >
              <span className="nav-icon">💸</span>
              <span>Transfer Funds</span>
            </button>

            <button
              className={`sidebar-nav-item ${currentView === 'deposit_withdraw' ? 'active' : ''}`}
              onClick={() => onSelectView('deposit_withdraw')}
            >
              <span className="nav-icon">📥</span>
              <span>Deposit / Withdraw</span>
            </button>
          </>
        )}

        <button
          className={`sidebar-nav-item ${currentView === 'statement' ? 'active' : ''}`}
          onClick={() => onSelectView('statement')}
        >
          <span className="nav-icon">📜</span>
          <span>Account Statement</span>
        </button>

        {/* Administration & Compliance Section (Role-Gated) */}
        {isStaff && (
          <>
            <div className="nav-section-label nav-section-mt">AUDIT & GOVERNANCE</div>

            {isAdmin && (
              <button
                className={`sidebar-nav-item ${currentView === 'admin_users' ? 'active' : ''}`}
                onClick={() => onSelectView('admin_users')}
              >
                <span className="nav-icon">👥</span>
                <span>User Management</span>
              </button>
            )}

            <button
              className={`sidebar-nav-item ${currentView === 'audit_logs' ? 'active' : ''}`}
              onClick={() => onSelectView('audit_logs')}
            >
              <span className="nav-icon">🔍</span>
              <span>Security Audit Logs</span>
            </button>

            <button
              className={`sidebar-nav-item ${currentView === 'reconciliation' ? 'active' : ''}`}
              onClick={() => onSelectView('reconciliation')}
            >
              <span className="nav-icon">⚖️</span>
              <span>Ledger Reconciliation</span>
            </button>
          </>
        )}
      </nav>

      {/* Sidebar Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-health-status">
          <span className="status-dot"></span>
          <span>API & PostgreSQL Online</span>
        </div>
        <button className="btn-sidebar-logout" onClick={onLogout}>
          <span>Sign Out</span> 🚪
        </button>
      </div>
    </aside>
  );
}

