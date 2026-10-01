import { createContext, useContext, useState, useEffect } from 'react';
import { getSupabase } from './supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    // Determine API origin dynamically
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const apiHost = isLocal
      ? `${window.location.protocol}//${window.location.hostname}:5000`
      : window.location.origin;
    
    fetch(`${apiHost}/api/config`)
      .then(res => res.json())
      .then(data => {
        const { supabaseUrl, supabaseAnonKey } = data;
        
        if (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your_supabase_url')) {
          const client = getSupabase(supabaseUrl, supabaseAnonKey);
          setSupabaseClient(client);
          setConfigured(true);

          client.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
          });

          const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
          });

          return () => subscription.unsubscribe();
        } else {
          // Mock session for demo if Supabase keys aren't added yet
          const mockUser = {
            id: 'demo-user-123',
            email: 'demo@ledger.app',
            user_metadata: { name: 'Demo User' },
          };
          setUser(mockUser);
          setConfigured(false);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('Failed to load database configuration from backend:', err);
        // Fallback to local demo mode on connection error
        const mockUser = {
          id: 'demo-user-123',
          email: 'demo@ledger.app',
          user_metadata: { name: 'Demo User' },
        };
        setUser(mockUser);
        setConfigured(false);
        setLoading(false);
      });
  }, []);

  // Fetch or mock profile data
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    if (!configured) {
      setProfile({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.name || 'Demo Admin User',
        is_admin: true,
        monthly_budget: 50000,
        currency: 'PKR'
      });
      return;
    }

    if (!supabaseClient) return;

    let active = true;
    const fetchProfile = async () => {
      try {
        const { data, error } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching user profile:', error);
          return;
        }

        if (active) {
          setProfile(data);
        }
      } catch (err) {
        console.error('Failed to load user profile:', err);
      }
    };

    fetchProfile();
    return () => { active = false; };
  }, [user, configured, supabaseClient]);

  const signUp = async (email, password, fullName) => {
    if (!configured || !supabaseClient) {
      throw new Error('Authentication service is currently offline. Please configure your credentials inside backend/.env');
    }
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });
    if (error) throw error;
    
    // If user already exists, Supabase returns user but identities array is empty
    if (data?.user && data.user.identities && data.user.identities.length === 0) {
      throw new Error('This email address is already registered. Please sign in instead.');
    }
    
    return data;
  };

  const signIn = async (email, password) => {
    if (!configured || !supabaseClient) {
      throw new Error('Authentication service is currently offline. Please configure your credentials inside backend/.env');
    }
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    if (!configured || !supabaseClient) {
      setUser(null);
      setSession(null);
      setProfile(null);
      return;
    }
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    setUser(null);
    setSession(null);
    setProfile(null);
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
