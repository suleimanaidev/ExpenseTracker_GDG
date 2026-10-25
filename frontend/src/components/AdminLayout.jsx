import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useSeo } from '../seo/useSeo';

const items = [
  ['Overview', '/admin'],
  ['Users', '/admin/users'],
  ['Expenses', '/admin/expenses'],
  ['Bills', '/admin/bills'],
  ['AI Usage', '/admin/ai-usage'],
  ['Audit log', '/admin/audit-log'],
  ['System', '/admin/system'],
  ['Settings', '/admin/settings'],
];

export default function AdminLayout() {
  const { user, loading } = useAuth();
  useSeo({ title: 'Admin | Ledger', noindex: true });

  if (loading) {
    return (
      <div className="flex-center min-h-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!(user.isAdmin || user.is_admin)) {
    return <Navigate to="/overview" replace />;
  }

  return (
    <div className="app-layout admin-layout">
      <aside className="sidebar admin-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div>
              <div className="sidebar-brand-label">LEDGER</div>
              <div className="sidebar-brand-sub">Admin Console</div>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Admin navigation">
          {items.map(([label, href]) => (
            <NavLink
              key={href}
              to={href}
              end={href === '/admin'}
              className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`}
            >
              <span className="sidebar-link-label">{label}</span>
            </NavLink>
          ))}
        </nav>
        <NavLink to="/overview" className="sidebar-link">
          Back to Ledger
        </NavLink>
      </aside>
      <main className="main-content" id="main-content">
        <Outlet />
      </main>
    </div>
  );
}
