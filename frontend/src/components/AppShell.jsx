import { useLocation, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../lib/AuthContext';

export default function AppShell({ children }) {
  const location = useLocation();
  const { user, loading, configured } = useAuth();

  // Auth initialization state
  if (loading) {
    return (
      <div className="flex-center min-h-screen">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  // Unauthenticated user guard when Supabase is configured
  if (!user && configured) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content" id="main-content">
        {children}
      </main>
    </div>
  );
}
