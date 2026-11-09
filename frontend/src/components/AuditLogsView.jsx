import React, { useState, useEffect } from 'react';
import { fetchAuditLogs } from '../services/api';

export default function AuditLogsView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const loadLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAuditLogs({
        action: actionFilter || undefined,
        outcome: outcomeFilter || undefined,
        limit: 100,
      });
      setLogs(data.logs || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch audit event logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [outcomeFilter, actionFilter]);

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h3>Security & Operational Audit Trail</h3>
          <p>Forensic ledger of all authentication events, financial transfers, and administrative actions.</p>
        </div>
        <button className="btn-secondary-sm" onClick={loadLogs} disabled={loading}>
          {loading ? 'Refreshing...' : '🔄 Refresh Logs'}
        </button>
      </div>

      {/* Filter Controls Bar */}
      <div className="audit-filters-bar">
        <div className="filter-group">
          <label>Filter by Outcome:</label>
          <div className="filter-pills">
            <button
              className={`pill-btn ${outcomeFilter === '' ? 'active' : ''}`}
              onClick={() => setOutcomeFilter('')}
            >
              All Outcomes
            </button>
            <button
              className={`pill-btn ${outcomeFilter === 'SUCCESS' ? 'active' : ''}`}
              onClick={() => setOutcomeFilter('SUCCESS')}
            >
              ✅ Successful Only
            </button>
            <button
              className={`pill-btn ${outcomeFilter === 'DENIED' ? 'active' : ''}`}
              onClick={() => setOutcomeFilter('DENIED')}
            >
              ⛔ Denied / Refused Only
            </button>
          </div>
        </div>

        <div className="filter-group">
          <label>Filter Action:</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="">All Actions</option>
            <option value="LOGIN">LOGIN</option>
            <option value="REGISTER">REGISTER</option>
            <option value="TRANSFER">TRANSFER</option>
            <option value="DEPOSIT">DEPOSIT</option>
            <option value="WITHDRAWAL">WITHDRAWAL</option>
            <option value="ACCOUNT_STATUS_CHANGE">ACCOUNT_STATUS_CHANGE</option>
          </select>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-card">
          <div className="spinner"></div>
          <p>Querying immutable audit events...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="empty-card">
          <p>No audit events match your selected filters.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="statement-table">
            <thead>
              <tr>
                <th>Event ID</th>
                <th>Timestamp</th>
                <th>User / Initiator</th>
                <th>Action</th>
                <th>Outcome</th>
                <th>Account Involved</th>
                <th>Audit Reason / Description</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="cell-tx">#{log.id}</td>
                  <td className="cell-date">
                    {new Date(log.created_at).toLocaleString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td>
                    {log.user_email ? (
                      <div>
                        <strong>{log.user_name || 'User'}</strong>
                        <div className="text-muted-xs">{log.user_email}</div>
                      </div>
                    ) : (
                      <span className="text-muted-sm">Unauthenticated</span>
                    )}
                  </td>
                  <td>
                    <span className="pill-type">{log.action}</span>
                  </td>
                  <td>
                    <span className={`pill-entry ${log.outcome === 'SUCCESS' ? 'pill-credit' : 'pill-debit'}`}>
                      {log.outcome === 'SUCCESS' ? 'SUCCESS' : 'DENIED'}
                    </span>
                  </td>
                  <td className="cell-counterpart">
                    {log.account_number || (log.account_id ? `Account #${log.account_id}` : '—')}
                  </td>
                  <td className="cell-reason">{log.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
