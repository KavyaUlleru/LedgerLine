import React, { useState, useEffect } from 'react';
import { fetchAdminUsers, updateAccountStatus } from '../services/api';

export default function AdminUsersView() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminUsers();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch user list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleToggleFreeze = async (accountId, currentStatus, accountNumber) => {
    setActionLoadingId(accountId);
    setFeedback(null);
    const newStatus = currentStatus === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';
    const reason = newStatus === 'FROZEN' ? 'Administrative security freeze' : 'Administrative unfreeze';

    try {
      const res = await updateAccountStatus(accountId, newStatus, reason);
      setFeedback({
        type: 'success',
        message: res.message,
      });
      await loadUsers();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || `Failed to update status for ${accountNumber}`,
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatINR = (paise) => {
    const val = (Number(paise || 0) / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `₹${val}`;
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h3>System User & Account Governance</h3>
          <p>Supervise registered users, inspect account balances, and toggle account freeze status.</p>
        </div>
        <button className="btn-secondary-sm" onClick={loadUsers} disabled={loading}>
          {loading ? 'Refreshing...' : '🔄 Refresh Users'}
        </button>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type}`}>
          <p><strong>{feedback.message}</strong></p>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-card">
          <div className="spinner"></div>
          <p>Loading user accounts from PostgreSQL...</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="statement-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Full Name</th>
                <th>Email Address</th>
                <th>Role</th>
                <th>Linked Accounts & Balances</th>
                <th>Account Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="cell-tx">#{u.id}</td>
                  <td><strong>{u.name}</strong></td>
                  <td className="cell-counterpart">{u.email}</td>
                  <td>
                    <span className={`role-badge badge-${u.role.toLowerCase().replace('_', '-')}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    {u.accounts.length === 0 ? (
                      <span className="text-muted-sm">No accounts</span>
                    ) : (
                      <div className="account-chips-container">
                        {u.accounts.map((acc) => (
                          <div key={acc.id} className="account-chip">
                            <span className="acc-chip-num">{acc.accountNumber}</span>
                            <span className="acc-chip-bal">{formatINR(acc.balance)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    {u.accounts.map((acc) => (
                      <span key={acc.id} className={`status-pill status-${(acc.status || '').toLowerCase()}`}>
                        {acc.status}
                      </span>
                    ))}
                  </td>
                  <td>
                    {u.accounts.map((acc) => (
                      acc.accountType === 'STANDARD' && (
                        <button
                          key={acc.id}
                          type="button"
                          className={`btn-action-status ${acc.status === 'ACTIVE' ? 'btn-freeze' : 'btn-unfreeze'}`}
                          disabled={actionLoadingId === acc.id}
                          onClick={() => handleToggleFreeze(acc.id, acc.status, acc.accountNumber)}
                        >
                          {actionLoadingId === acc.id ? 'Updating...' : acc.status === 'ACTIVE' ? '🔒 Freeze' : '🔓 Unfreeze'}
                        </button>
                      )
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

