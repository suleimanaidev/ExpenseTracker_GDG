import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);

  // Initialize auth state
  const initAuth = useCallback(async () => {
    try {
      // 1. Health check backend connectivity
      const health = await api.get('/api/health');
      if (health?.status === 'ok' || health?.status === 'degraded') {
        setConfigured(true);

        // 2. Attempt to restore session using stored token or refresh endpoint
        try {
          const meData = await api.get('/api/auth/me');
          if (meData?.user) {
            setUser(meData.user);
            setProfile(meData.user);
            setSession({ access_token: api.getToken(), user: meData.user });
            setLoading(false);
            return;
          }
        } catch {
          // Token invalid or expired, attempt refresh
          try {
            const refreshData = await api.post('/api/auth/refresh');
            if (refreshData?.accessToken && refreshData?.user) {
              api.setToken(refreshData.accessToken);
              setUser(refreshData.user);
              setProfile(refreshData.user);
              setSession({ access_token: refreshData.accessToken, user: refreshData.user });
              setLoading(false);
              return;
            }
          } catch {
            // Not logged in yet
          }
        }
      } else {
        setConfigured(false);
      }
    } catch {
      // Backend is unreachable, switch to offline demo mode
      console.warn('Backend server is unreachable. Running in offline demo mode.');
      setConfigured(false);
      const mockUser = {
        id: 'demo-user-123',
        email: 'demo@ledger.app',
        full_name: 'Demo Admin User',
        fullName: 'Demo Admin User',
        is_admin: true,
        isAdmin: true,
        monthly_budget: 50000,
        monthlyBudget: 50000,
        currency: 'PKR',
        joined_at: new Date().toISOString(),
      };
      setUser(mockUser);
      setProfile(mockUser);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const signUp = async (email, password, fullName) => {
    if (!configured) {
      throw new Error('Authentication backend is offline. You can continue as Guest in Demo Mode.');
    }

    const data = await api.post('/api/auth/register', {
      email,
      password,
      fullName,
    });

    if (data?.accessToken) {
      api.setToken(data.accessToken);
      setUser(data.user);
      setProfile(data.user);
      setSession({ access_token: data.accessToken, user: data.user });
    }
    return data;
  };

  const signIn = async (email, password) => {
    if (!configured) {
      throw new Error('Authentication backend is offline. You can continue as Guest in Demo Mode.');
    }

    const data = await api.post('/api/auth/login', {
      email,
      password,
    });

    if (data?.accessToken) {
      api.setToken(data.accessToken);
      setUser(data.user);
      setProfile(data.user);
      setSession({ access_token: data.accessToken, user: data.user });
    }
    return data;
  };

  const signOut = async () => {
    if (configured) {
      try {
        await api.post('/api/auth/logout');
      } catch (err) {
        console.error('Logout error:', err);
      }
    }
    api.clearToken();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (configured && user) {
      try {
        const p = await api.get('/api/profile');
        if (p) {
          setProfile(p);
          setUser(prev => ({ ...prev, ...p }));
        }
      } catch (err) {
        console.error('Failed to refresh profile:', err);
      }
    }
  };

  const value = {
    user,
    profile,
    session,
    loading,
    configured,
    signUp,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
