import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { DataProvider } from './lib/DataContext';
import AppShell from './components/AppShell';
import AdminLayout from './components/AdminLayout';
import PageSkeleton from './components/PageSkeleton';

const Overview = lazy(() => import('./pages/Overview'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Insights = lazy(() => import('./pages/Insights'));
const Settings = lazy(() => import('./pages/Settings'));
const Login = lazy(() => import('./pages/Login'));
const Landing = lazy(() => import('./pages/Landing'));
const Admin = lazy(() => import('./pages/Admin'));

function PageLoader() {
  return (
    <div className="flex-center min-h-screen">
      <div className="loading-spinner" />
    </div>
  );
}

// Every route change starts at the top of the new page. Without this the browser
// keeps the previous scroll offset, so short pages open half-scrolled and the
// header is never visible.
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}

// Cross-fades the page body on navigation. The animation is opacity-only on
// purpose: a transformed ancestor would turn every `position: fixed` modal
// inside the page into a box scoped to the page wrapper.
function PageTransition({ children }) {
  const { pathname } = useLocation();

  return (
    <div className="page-transition" key={pathname}>
      {children}
    </div>
  );
}

// The public root is the marketing page and it stays there. Previously `/` was
// also the dashboard home, so restoring a valid refresh cookie on reload took
// over the page and signed the visitor straight in — a reload on the landing
// page could never show the landing page again. The signed-in home now lives at
// /overview so the two never fight over the same URL.
function LandingRoute() {
  const { loading } = useAuth();

  if (loading) return <PageLoader />;

  return <Landing />;
}

function DashboardLayout() {
  const location = useLocation();
  const { user, loading, configured, maintenance } = useAuth();

  if (loading) return <PageLoader />;

  if (!user && configured && !maintenance) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <AppShell>
      <Suspense fallback={<PageSkeleton />}>
        <PageTransition>
          <Outlet />
        </PageTransition>
      </Suspense>
    </AppShell>
  );
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      <AuthProvider>
        <DataProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<LandingRoute />} />
              <Route path="/login" element={<Login />} />

              {/* Dashboard routes share one shell so navigation stays smooth */}
              <Route element={<DashboardLayout />}>
                <Route path="overview" element={<Overview />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="bills" element={<Navigate to="/transactions?view=bills" replace />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="insights" element={<Insights />} />
                <Route path="settings" element={<Settings />} />
              </Route>

              <Route path="/admin/*" element={<AdminLayout />}>
                <Route index element={<Admin />} />
                <Route path="users" element={<Admin />} />
                <Route path="expenses" element={<Admin />} />
                <Route path="bills" element={<Admin />} />
                <Route path="audit-log" element={<Admin />} />
                <Route path="system" element={<Admin />} />
                <Route path="ai-usage" element={<Admin />} />
                <Route path="settings" element={<Admin />} />
              </Route>

              {/* Fallback to Root */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </DataProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
