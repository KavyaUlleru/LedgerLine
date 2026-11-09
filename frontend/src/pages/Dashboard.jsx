import React, { useState, useEffect } from 'react';
import {
  fetchAccounts,
  fetchAccountStatement,
  executeTransfer,
  executeDeposit,
  executeWithdraw,
  generateUUID,
} from '../services/api';
import AdminUsersView from '../components/AdminUsersView';
import AuditLogsView from '../components/AuditLogsView';
import ReconciliationView from '../components/ReconciliationView';

export default function Dashboard({
  user,
  currentView = 'overview',
  onSelectView,
  accounts: initialAccounts = [],
  selectedAccountId,
  setSelectedAccountId,
  onRefreshAccounts,
}) {
  const [accounts, setAccounts] = useState(initialAccounts);

  // Transfer State
  const [destAccountNumber, setDestAccountNumber] = useState('');
  const [transferAmountInr, setTransferAmountInr] = useState('');
  const [transferIdempotencyKey, setTransferIdempotencyKey] = useState(generateUUID());
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState(null);

  // Deposit / Withdraw State
  const [dwType, setDwType] = useState('DEPOSIT');
  const [dwAmountInr, setDwAmountInr] = useState('');
  const [dwLoading, setDwLoading] = useState(false);
  const [dwFeedback, setDwFeedback] = useState(null);

  // Statement State
  const [statement, setStatement] = useState([]);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementError, setStatementError] = useState('');

  // Synchronize accounts state with props
  useEffect(() => {
    setAccounts(initialAccounts);
    if (initialAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(initialAccounts[0].id);
    }
  }, [initialAccounts]);

  // Load statement when selected account changes or statement view is active
  useEffect(() => {
    if (selectedAccountId && currentView === 'statement') {
      loadStatement(selectedAccountId);
    }
  }, [selectedAccountId, currentView]);

  const loadStatement = async (accId) => {
    setStatementLoading(true);
    setStatementError('');
    try {
      const data = await fetchAccountStatement(accId);
      setStatement(data.statement || []);
    } catch (err) {
      setStatementError(err.message || 'Failed to load statement.');
    } finally {
      setStatementLoading(false);
    }
  };

  const refreshAccountData = async () => {
    try {
      const data = await fetchAccounts();
      setAccounts(data.accounts || []);
      if (onRefreshAccounts) onRefreshAccounts(data.accounts);
      if (selectedAccountId) {
        loadStatement(selectedAccountId);
      }
    } catch (err) {
      console.error('Failed to refresh accounts:', err);
    }
  };

  const toPaise = (inrStr) => {
    const parsed = parseFloat(inrStr);
    if (isNaN(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  };

  const formatINR = (paise) => {
    const val = (Number(paise || 0) / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `₹${val}`;
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    setTransferFeedback(null);

    const amountPaise = toPaise(transferAmountInr);
    if (!amountPaise || amountPaise <= 0) {
      setTransferFeedback({
        type: 'error',
        message: 'Please enter a valid amount greater than ₹0.00.',
      });
      return;
    }

    if (!destAccountNumber.trim()) {
      setTransferFeedback({
        type: 'error',
        message: 'Please enter a destination account number.',
      });
      return;
    }

    setTransferLoading(true);
    try {
      const result = await executeTransfer({
        sourceAccountId: selectedAccountId,
        destinationAccountNumber: destAccountNumber.trim(),
        amountPaise,
        idempotencyKey: transferIdempotencyKey,
      });

      setTransferFeedback({
        type: 'success',
        message: `Transfer of ${result.amountFormatted} completed successfully!`,
        details: `Tx ID: #${result.transactionId} • Double-entry balanced • New balance: ${formatINR(result.sourceAccount.newBalance)}`,
      });

      setTransferAmountInr('');
      setDestAccountNumber('');
      setTransferIdempotencyKey(generateUUID());
      await refreshAccountData();
    } catch (err) {
      setTransferFeedback({
        type: 'error',
        message: err.data?.status === 'REFUSED' ? `Transaction Refused: ${err.message}` : err.message,
        details: err.data?.reason ? `Reason: ${err.data.reason} • Zero ledger entries created.` : null,
      });
    } finally {
      setTransferLoading(false);
    }
  };

  const handleDepositWithdrawSubmit = async (e) => {
    e.preventDefault();
    setDwFeedback(null);

    const amountPaise = toPaise(dwAmountInr);
    if (!amountPaise || amountPaise <= 0) {
      setDwFeedback({
        type: 'error',
        message: 'Please enter a valid amount greater than ₹0.00.',
      });
      return;
    }

    setDwLoading(true);
    try {
      let result;
      const key = generateUUID();

      if (dwType === 'DEPOSIT') {
        result = await executeDeposit({
          accountId: selectedAccountId,
          amountPaise,
          idempotencyKey: key,
        });
      } else {
        result = await executeWithdraw({
          accountId: selectedAccountId,
          amountPaise,
          idempotencyKey: key,
        });
      }

      setDwFeedback({
        type: 'success',
        message: `${dwType === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} of ${result.amountFormatted} successful!`,
        details: `Tx ID: #${result.transactionId} • New balance: ${formatINR(result.newBalance)}`,
      });

      setDwAmountInr('');
      await refreshAccountData();
    } catch (err) {
      setDwFeedback({
        type: 'error',
        message: err.message || 'Operation failed.',
        details: err.data?.reason ? `Reason: ${err.data.reason}` : null,
      });
    } finally {
      setDwLoading(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === parseInt(selectedAccountId, 10)) || accounts[0];

  // Render Role-Gated Admin / Audit Views
  if (currentView === 'admin_users') {
    return <AdminUsersView />;
  }

  if (currentView === 'audit_logs') {
    return <AuditLogsView />;
  }

  if (currentView === 'reconciliation') {
    return <ReconciliationView />;
  }

  return (
    <div className="dashboard-content-area">
      {/* View 1: Accounts Overview */}
      {currentView === 'overview' && (
        <div className="tab-pane">
          <div className="section-title">
            <h3>Your Linked Accounts</h3>
            <div className="title-actions">
              <button className="btn-secondary-sm" onClick={refreshAccountData}>
                🔄 Refresh Balances
              </button>
            </div>
          </div>

          <div className="accounts-grid">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className={`account-card ${selectedAccountId === acc.id ? 'card-selected' : ''}`}
                onClick={() => setSelectedAccountId(acc.id)}
              >
                <div className="account-card-header">
                  <div>
                    <span className="account-type-tag">{acc.accountType || acc.account_type}</span>
                    <h4 className="account-number">{acc.accountNumber || acc.account_number}</h4>
                  </div>
                  <span className={`status-pill status-${(acc.status || '').toLowerCase()}`}>
                    {acc.status}
                  </span>
                </div>

                <div className="account-balance-section">
                  <span className="balance-label">Current Balance</span>
                  <span className="balance-amount">{formatINR(acc.balance)}</span>
                </div>

                <div className="account-card-footer">
                  <span className="account-id">ID: #{acc.id}</span>
                  <span className="action-hint">Active account</span>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Action Tiles */}
          <div className="quick-actions-row">
            {user.role !== 'AUDITOR' && (
              <>
                <div className="quick-action-tile" onClick={() => onSelectView('transfer')}>
                  <span className="qa-icon">💸</span>
                  <h5>Transfer Money</h5>
                  <p>Send funds safely with double-entry precision and row-locking concurrency.</p>
                </div>
                <div className="quick-action-tile" onClick={() => onSelectView('deposit_withdraw')}>
                  <span className="qa-icon">📥</span>
                  <h5>Deposit / Withdraw</h5>
                  <p>Deposit funds or withdraw cash via the system reserve.</p>
                </div>
              </>
            )}
            <div className="quick-action-tile" onClick={() => onSelectView('statement')}>
              <span className="qa-icon">📜</span>
              <h5>View Statement</h5>
              <p>Inspect immutable ledger records and computed running balances.</p>
            </div>
          </div>

          {/* SnovaSys Milestone Callout */}
          <div className="milestone-box">
            <div className="milestone-header">
              <span className="milestone-badge">Tasks 1-3 Live</span>
              <h4>Active Platform Guarantees</h4>
            </div>
            <ul className="guarantee-list">
              <li>⚖️ <strong>Double-Entry Symmetry:</strong> Paired debits and credits ensure money conservation.</li>
              <li>🛡️ <strong>Pessimistic Concurrency Locking:</strong> <code>SELECT ... FOR UPDATE</code> with ascending account ID sort.</li>
              <li>🛑 <strong>Server-Side Negative Balance Prevention:</strong> Check constraint guarantees balances cannot fall below zero.</li>
              <li>🔑 <strong>Idempotency Deduplication:</strong> Unique client keys prevent duplicate transfers.</li>
              <li>🔍 <strong>Compliance & Auditing:</strong> Append-only security audit trail and mathematical reconciliation.</li>
            </ul>
          </div>
        </div>
      )}

      {/* View 2: Transfer Money */}
      {currentView === 'transfer' && (
        <div className="tab-pane">
          <div className="card-form-wrapper">
            <div className="card-form-header">
              <h3>Transfer Money (Double-Entry Engine)</h3>
              <p>Protected by row-level locks, double-entry ledgering, and idempotency keys.</p>
            </div>

            {transferFeedback && (
              <div className={`alert alert-${transferFeedback.type}`}>
                <p><strong>{transferFeedback.message}</strong></p>
                {transferFeedback.details && <p className="alert-details">{transferFeedback.details}</p>}
              </div>
            )}

            <form onSubmit={handleTransferSubmit} className="financial-form">
              <div className="form-group">
                <label>Debit Source Account</label>
                <select
                  value={selectedAccountId || ''}
                  onChange={(e) => setSelectedAccountId(parseInt(e.target.value, 10))}
                  required
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.accountNumber || acc.account_number} — Available: {formatINR(acc.balance)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Credit Destination Account Number</label>
                <input
                  type="text"
                  placeholder="e.g., ACC-1002"
                  value={destAccountNumber}
                  onChange={(e) => setDestAccountNumber(e.target.value)}
                  required
                />
                <div className="quick-recipients">
                  <span className="quick-label">Quick Destination:</span>
                  <button
                    type="button"
                    className="btn-chip"
                    onClick={() => setDestAccountNumber('ACC-1002')}
                  >
                    Bob (ACC-1002)
                  </button>
                  <button
                    type="button"
                    className="btn-chip"
                    onClick={() => setDestAccountNumber('ACC-1001')}
                  >
                    Alice (ACC-1001)
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Amount in Rupees (₹)</label>
                <div className="input-with-prefix">
                  <span className="input-prefix">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="100.00"
                    value={transferAmountInr}
                    onChange={(e) => setTransferAmountInr(e.target.value)}
                    required
                  />
                </div>
                {transferAmountInr && (
                  <span className="paise-preview">
                    = {toPaise(transferAmountInr).toLocaleString()} paise (stored as integer minor units)
                  </span>
                )}
              </div>

              {/* Idempotency Inspector */}
              <div className="idempotency-box">
                <div className="idemp-header">
                  <span className="idemp-title">🔑 Idempotency Key (Duplicate Prevention)</span>
                  <button
                    type="button"
                    className="btn-link-sm"
                    onClick={() => setTransferIdempotencyKey(generateUUID())}
                  >
                    Regenerate Key
                  </button>
                </div>
                <code className="idemp-code">{transferIdempotencyKey}</code>
                <p className="idemp-help">
                  Submitting with the exact same key replays the original response without executing duplicate debits.
                </p>
              </div>

              <button type="submit" className="btn btn-primary" disabled={transferLoading}>
                {transferLoading ? 'Executing Atomic Transfer...' : 'Confirm & Transfer Funds'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* View 3: Deposit & Withdraw */}
      {currentView === 'deposit_withdraw' && (
        <div className="tab-pane">
          <div className="card-form-wrapper">
            <div className="card-form-header">
              <h3>Simulated Deposit & Withdrawal</h3>
              <p>Routes symmetrically through the System Reserve vault for 100% money conservation.</p>
            </div>

            {dwFeedback && (
              <div className={`alert alert-${dwFeedback.type}`}>
                <p><strong>{dwFeedback.message}</strong></p>
                {dwFeedback.details && <p className="alert-details">{dwFeedback.details}</p>}
              </div>
            )}

            <div className="action-toggle">
              <button
                type="button"
                className={`toggle-btn ${dwType === 'DEPOSIT' ? 'active-deposit' : ''}`}
                onClick={() => setDwType('DEPOSIT')}
              >
                ➕ Cash Deposit
              </button>
              <button
                type="button"
                className={`toggle-btn ${dwType === 'WITHDRAW' ? 'active-withdraw' : ''}`}
                onClick={() => setDwType('WITHDRAW')}
              >
                ➖ Cash Withdrawal
              </button>
            </div>

            <form onSubmit={handleDepositWithdrawSubmit} className="financial-form">
              <div className="form-group">
                <label>Account</label>
                <select
                  value={selectedAccountId || ''}
                  onChange={(e) => setSelectedAccountId(parseInt(e.target.value, 10))}
                  required
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.accountNumber || acc.account_number} — Current: {formatINR(acc.balance)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>{dwType === 'DEPOSIT' ? 'Deposit Amount (₹)' : 'Withdrawal Amount (₹)'}</label>
                <div className="input-with-prefix">
                  <span className="input-prefix">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="50.00"
                    value={dwAmountInr}
                    onChange={(e) => setDwAmountInr(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={dwLoading}>
                {dwLoading ? 'Processing Operation...' : dwType === 'DEPOSIT' ? 'Execute Deposit' : 'Execute Withdrawal'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* View 4: Account Statement */}
      {currentView === 'statement' && (
        <div className="tab-pane">
          <div className="statement-header-bar">
            <div>
              <h3>Official Ledger Statement</h3>
              <p>
                Account: <strong>{selectedAccount?.accountNumber || selectedAccount?.account_number}</strong> • Current Balance: <strong className="statement-balance">{formatINR(selectedAccount?.balance)}</strong>
              </p>
            </div>

            <div className="statement-controls">
              <select
                value={selectedAccountId || ''}
                onChange={(e) => setSelectedAccountId(parseInt(e.target.value, 10))}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountNumber || acc.account_number}
                  </option>
                ))}
              </select>

              <button
                className="btn-secondary-sm"
                onClick={() => loadStatement(selectedAccountId)}
                disabled={statementLoading}
              >
                {statementLoading ? 'Refreshing...' : '🔄 Refresh Ledger'}
              </button>
            </div>
          </div>

          {statementError && <div className="alert alert-error">{statementError}</div>}

          {statementLoading ? (
            <div className="loading-card">
              <div className="spinner"></div>
              <p>Fetching immutable ledger records...</p>
            </div>
          ) : statement.length === 0 ? (
            <div className="empty-card">
              <p>No transactions found for this account yet.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="statement-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Tx ID</th>
                    <th>Type</th>
                    <th>Flow Direction</th>
                    <th>Counterpart Account</th>
                    <th>Amount</th>
                    <th>Running Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.map((row) => (
                    <tr key={row.id}>
                      <td className="cell-date">
                        {new Date(row.createdAt).toLocaleString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="cell-tx">#{row.transactionId}</td>
                      <td>
                        <span className="pill-type">{row.transactionType}</span>
                      </td>
                      <td>
                        <span className={`pill-entry pill-${row.entryType.toLowerCase()}`}>
                          {row.entryType === 'CREDIT' ? '📥 CREDIT (Inflow)' : '📤 DEBIT (Outflow)'}
                        </span>
                      </td>
                      <td className="cell-counterpart">{row.counterpartAccount}</td>
                      <td className={`cell-amount ${row.entryType === 'CREDIT' ? 'amount-credit' : 'amount-debit'}`}>
                        {row.entryType === 'CREDIT' ? `+ ${formatINR(row.amount)}` : `- ${formatINR(row.amount)}`}
                      </td>
                      <td className="cell-running-balance">
                        {formatINR(row.runningBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
