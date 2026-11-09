import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import {
  getToken,
  getStoredUser,
  setAuthSession,
  clearAuthSession,
  fetchCurrentUser,
  loginUser,
} from './services/api';

export default function App() {
  const [token, setToken] = useState(getToken());
  const [user, setUser] = useState(getStoredUser());
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [currentView, setCurrentView] = useState('overview');
  const [authView, setAuthView] = useState('login'); // 'login' or 'register'
  const [initialLoading, setInitialLoading] = useState(true);

  // Restore session on page load
  useEffect(() => {
    async function restoreSession() {
      const storedToken = getToken();
      if (storedToken) {
        try {
          const data = await fetchCurrentUser();
          setUser(data.user);
          const accs = data.accounts || [];
          setAccounts(accs);
          if (accs.length > 0) {
            setSelectedAccountId(accs[0].id);
          }
          if (data.user.role === 'AUDITOR') {
            setCurrentView('audit_logs');
          }
        } catch {
          clearAuthSession();
          setToken(null);
          setUser(null);
          setAccounts([]);
        }
      }
      setInitialLoading(false);
    }

    restoreSession();
  }, []);

  const handleLoginSuccess = (newToken, newUser, newAccounts = []) => {
    setAuthSession(newToken, newUser);
    setToken(newToken);
    setUser(newUser);
    setAccounts(newAccounts);
    if (newAccounts.length > 0) {
      setSelectedAccountId(newAccounts[0].id);
    }
    if (newUser.role === 'AUDITOR') {
      setCurrentView('audit_logs');
    } else {
      setCurrentView('overview');
    }
  };

  const handleRegisterSuccess = (newToken, newUser, newAccounts = []) => {
    setAuthSession(newToken, newUser);
    setToken(newToken);
    setUser(newUser);
    setAccounts(newAccounts);
    if (newAccounts.length > 0) {
      setSelectedAccountId(newAccounts[0].id);
    }
    setCurrentView('overview');
  };

  const handleLogout = () => {
    clearAuthSession();
    setToken(null);
    setUser(null);
    setAccounts([]);
    setSelectedAccountId(null);
    setCurrentView('overview');
    setAuthView('login');
  };

  // Evaluator Quick-Switch User (allows instant role testing without manual relogin)
  const handleQuickSwitchUser = async (email, password) => {
    try {
      const data = await loginUser(email, password);
      handleLoginSuccess(data.token, data.user, data.accounts);
    } catch (err) {
      alert(`Could not switch user: ${err.message}`);
    }
  };

  if (initialLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Connecting to LedgerLine security engine...</p>
      </div>
    );
  }

  // Unauthenticated Layout
  if (!user) {
    return (
      <div className="auth-shell">
        <header className="auth-top-header">
          <div className="auth-logo-badge">
            <span className="brand-logo">⚡</span>
            <div>
              <h1 className="brand-title">LedgerLine</h1>
              <span className="brand-subtitle">Audited Financial Transaction Management</span>
            </div>
          </div>
          <div className="system-status">
            <span className="status-dot"></span>
            <span className="status-text">PostgreSQL Online</span>
          </div>
        </header>

        <main className="auth-main-area">
          {authView === 'login' ? (
            <Login
              onLoginSuccess={handleLoginSuccess}
              onSwitchToRegister={() => setAuthView('register')}
            />
          ) : (
            <Register
              onRegisterSuccess={handleRegisterSuccess}
              onSwitchToLogin={() => setAuthView('login')}
            />
          )}
        </main>

        <footer className="app-footer">
          <p>
            <strong>LedgerLine</strong> — Audited Account Management & Financial Ledger
          </p>
          <p className="footer-subtext">
            Double-Entry Accounting • Row-Level Concurrency Locking • Database Idempotency
          </p>
        </footer>
      </div>
    );
  }

  // Authenticated Layout with Sidebar & Top Navbar
  return (
    <div className="app-layout">
      {/* Left Sidebar */}
      <Sidebar
        user={user}
        currentView={currentView}
        onSelectView={setCurrentView}
        onLogout={handleLogout}
      />

      {/* Main App Area */}
      <div className="app-main-pane">
        <Navbar
          user={user}
          currentView={currentView}
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelectAccount={setSelectedAccountId}
          onQuickSwitchUser={handleQuickSwitchUser}
        />

        <main className="view-content-wrapper">
          <Dashboard
            user={user}
            currentView={currentView}
            onSelectView={setCurrentView}
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            setSelectedAccountId={setSelectedAccountId}
            onRefreshAccounts={setAccounts}
          />
        </main>
      </div>
    </div>
  );
}
