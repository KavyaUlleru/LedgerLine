import React, { useState, useEffect } from 'react';
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
} from './services/api';

export default function App() {
  const [token, setToken] = useState(getToken());
  const [user, setUser] = useState(getStoredUser());
  const [accounts, setAccounts] = useState([]);
  const [authView, setAuthView] = useState('login'); // 'login' or 'register'
  const [initialLoading, setInitialLoading] = useState(true);

  // Restore session on load
  useEffect(() => {
    async function restoreSession() {
      const storedToken = getToken();
      if (storedToken) {
        try {
          const data = await fetchCurrentUser();
          setUser(data.user);
          setAccounts(data.accounts || []);
        } catch {
          // Token invalid or expired
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
  };

  const handleRegisterSuccess = (newToken, newUser, newAccounts = []) => {
    setAuthSession(newToken, newUser);
    setToken(newToken);
    setUser(newUser);
    setAccounts(newAccounts);
  };

  const handleLogout = () => {
    clearAuthSession();
    setToken(null);
    setUser(null);
    setAccounts([]);
    setAuthView('login');
  };

  if (initialLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Connecting to LedgerLine security engine...</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Navbar user={user} onLogout={handleLogout} />

      <main className="main-content">
        {user ? (
          <Dashboard
            user={user}
            accounts={accounts}
            onRefreshAccounts={setAccounts}
          />
        ) : authView === 'login' ? (
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
