import React from 'react';

export default function Navbar({
  user,
  currentView,
  accounts = [],
  selectedAccountId,
  onSelectAccount,
  onQuickSwitchUser,
}) {
  const getViewTitle = () => {
    switch (currentView) {
      case 'overview':
        return 'Accounts Overview';
      case 'transfer':
        return 'Send & Transfer Funds';
      case 'deposit_withdraw':
        return 'Cash Deposit & Withdrawal';
      case 'statement':
        return 'Official Account Statement';
      case 'admin_users':
        return 'System Administration: User Management';
      case 'audit_logs':
        return 'Compliance: Security Audit Trail';
      case 'reconciliation':
        return 'Double-Entry Reconciliation Proof';
      default:
        return 'Dashboard';
    }
  };

  return (
    <header className="top-navbar">
      <div className="top-navbar-left">
        <div className="breadcrumb">
          <span className="breadcrumb-root">LedgerLine</span>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">{getViewTitle()}</span>
        </div>
      </div>

      <div className="top-navbar-right">
        {/* Account Selector if multiple accounts exist */}
        {accounts.length > 1 && (
          <div className="navbar-account-select">
            <label htmlFor="nav-acc-select" className="nav-acc-label">Active:</label>
            <select
              id="nav-acc-select"
              value={selectedAccountId || ''}
              onChange={(e) => onSelectAccount(parseInt(e.target.value, 10))}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.accountNumber || acc.account_number} (₹{((acc.balance || 0) / 100).toFixed(2)})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Demo Fast Switcher for Hackathon Judges / Interviewers */}
        <div className="evaluator-switch-menu">
          <span className="evaluator-label">Demo Role Switch:</span>
          <button
            type="button"
            className="btn-evaluator"
            title="Switch to Alice"
            onClick={() => onQuickSwitchUser('alice@ledgerline.local', 'Alice123!')}
          >
            Alice (Holder)
          </button>
          <button
            type="button"
            className="btn-evaluator"
            title="Switch to Bob"
            onClick={() => onQuickSwitchUser('bob@ledgerline.local', 'Bob123!')}
          >
            Bob (Holder)
          </button>
          <button
            type="button"
            className="btn-evaluator"
            title="Switch to Admin"
            onClick={() => onQuickSwitchUser('admin@ledgerline.local', 'Admin123!')}
          >
            Admin
          </button>
          <button
            type="button"
            className="btn-evaluator"
            title="Switch to Auditor"
            onClick={() => onQuickSwitchUser('auditor@ledgerline.local', 'Auditor123!')}
          >
            Auditor
          </button>
        </div>
      </div>
    </header>
  );
}
