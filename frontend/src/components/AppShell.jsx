import { useState } from 'react';
import { useLocation, Navigate, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../lib/AuthContext';
import { useSeo } from '../seo/useSeo';

const SIDEBAR_STORAGE_KEY = 'ledger:sidebar-collapsed';

const PAGE_TITLES = {
  '/overview': 'Overview',
  '/transactions': 'Transactions',
  '/insights': 'Ledger AI',
  '/analytics': 'Analytics',
  '/settings': 'Settings',
};

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function AppShell({ children }) {
  const location = useLocation();
  const { user, loading, configured, maintenance } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);

  // Signed-in screens hold private data: a useful tab title, and never indexed.
  useSeo({
    title: `${PAGE_TITLES[location.pathname] || 'Dashboard'} | Ledger`,
    noindex: true,
  });

  function handleSidebarCollapse(next) {
    setSidebarCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Private browsing can block storage; the collapse still works for this session.
    }
  }

  // Auth initialization state
  if (loading) {
    return (
      <div className="flex-center min-h-screen">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  const isAdmin = Boolean(user?.isAdmin || user?.is_admin);

  // Administrators keep access so they can turn maintenance mode back off.
  if (maintenance && !isAdmin) {
    return (
      <div className="flex-center min-h-screen">
        <div
          className="card"
          role="status"
          aria-live="polite"
          style={{ maxWidth: 480, textAlign: 'center', padding: '2.5rem' }}
        >
          <h1 className="font-display" style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>
            Scheduled maintenance
          </h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Ledger is temporarily unavailable while we make improvements. Please check back shortly.
          </p>
          <div
            style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}
          >
            <button className="btn btn--green" onClick={() => window.location.reload()}>
              Retry
            </button>
            <Link className="btn btn--ghost" to="/login">
              Administrator sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated user guard when backend is configured
  if (!user && configured) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="app-layout">
      <Sidebar collapsed={sidebarCollapsed} onCollapseChange={handleSidebarCollapse} />
      <main
        className={`main-content${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
        id="main-content"
      >
        {children}
      </main>
    </div>
  );
}
