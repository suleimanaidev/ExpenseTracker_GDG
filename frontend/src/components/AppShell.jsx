import { useState } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../lib/AuthContext';

export default function AppShell({ children }) {
  const location = useLocation();
  const { user, loading, configured } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Auth initialization state
  if (loading) {
    return (
      <div className="flex-center min-h-screen">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  // Unauthenticated user guard when backend is configured
  if (!user && configured) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="app-layout">
      <Sidebar onCollapseChange={setSidebarCollapsed} />
      <main className={`main-content${sidebarCollapsed ? ' sidebar-collapsed' : ''}`} id="main-content">
        {children}
      </main>
    </div>
  );
}
