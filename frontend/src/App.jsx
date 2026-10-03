import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { DataProvider } from './lib/DataContext';
import AppShell from './components/AppShell';
import Overview from './pages/Overview';
import Transactions from './pages/Transactions';
import Analytics from './pages/Analytics';
import Insights from './pages/Insights';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Landing from './pages/Landing';
const Admin = lazy(() => import('./pages/Admin'));
import AdminLayout from './components/AdminLayout';

// Resolve root path depending on authentication status
function RootPathResolver() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex-center min-h-screen">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (user) {
    return (
      <AppShell>
        <Overview />
      </AppShell>
    );
  }

  return <Landing />;
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <DataProvider>
          <Routes>
            {/* Login and Landing routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RootPathResolver />} />
            
            {/* Dashboard routes wrapped in AppShell */}
            <Route path="/transactions" element={<AppShell><Transactions /></AppShell>} />
            <Route path="/analytics" element={<AppShell><Analytics /></AppShell>} />
            <Route path="/insights" element={<AppShell><Insights /></AppShell>} />
            <Route path="/settings" element={<AppShell><Settings /></AppShell>} />
            <Route
              path="/admin/*"
              element={(
                <Suspense fallback={<div className="flex-center min-h-screen"><div className="loading-spinner" /></div>}>
                  <AdminLayout />
                </Suspense>
              )}
            >
              <Route index element={<Admin />} />
              <Route path="users" element={<Admin />} />
              <Route path="expenses" element={<Admin />} />
              <Route path="bills" element={<Admin />} />
              <Route path="ai-usage" element={<Admin />} />
              <Route path="audit-log" element={<Admin />} />
              <Route path="settings" element={<Admin />} />
            </Route>
            
            {/* Fallback to Root */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </DataProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
