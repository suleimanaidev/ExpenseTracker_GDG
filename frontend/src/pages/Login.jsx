import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, signIn, signUp, signOut, configured } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Validation errors
  const [errors, setErrors] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  // Password visibility states
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && configured) {
      navigate(adminMode && (user.isAdmin || user.is_admin) ? '/admin' : '/');
    }
  }, [user, configured, navigate, adminMode]);

  const validateField = (name, value) => {
    let error = '';
    if (isSignUp) {
      if (name === 'fullName') {
        if (!value.trim()) error = 'Full name is required.';
      } else if (name === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!value.trim()) {
          error = 'Email is required.';
        } else if (!emailRegex.test(value)) {
          error = 'Please enter a valid email address.';
        }
      } else if (name === 'password') {
        if (!value) {
          error = 'Password is required.';
        } else if (value.length < 8) {
          error = 'Password must be at least 8 characters long.';
        }
      } else if (name === 'confirmPassword') {
        if (!value) {
          error = 'Please confirm your password.';
        } else if (value !== password) {
          error = 'Passwords do not match.';
        }
      }
    }
    setErrors(prev => ({ ...prev, [name]: error }));
    return error;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!configured) {
      setErrorMsg('Authentication service is currently offline. Please use Guest (Demo Mode).');
      return;
    }

    if (isSignUp) {
      // Validate all fields
      const errName = validateField('fullName', fullName);
      const errEmail = validateField('email', email);
      const errPass = validateField('password', password);
      const errConf = validateField('confirmPassword', confirmPassword);

      if (errName || errEmail || errPass || errConf) {
        setErrorMsg('Please correct the errors before submitting.');
        return;
      }

      setSubmitting(true);
      try {
        await signUp(email, password, fullName);
        setSuccessMsg('Account created successfully! Welcome to Ledger.');
        setTimeout(() => navigate('/'), 600);
      } catch (err) {
        setErrorMsg(err.message || 'An error occurred during account creation.');
      } finally {
        setSubmitting(false);
      }
    } else {
      if (!email || !password) {
        setErrorMsg('Please provide both email and password.');
        return;
      }

      setSubmitting(true);
      try {
        const data = await signIn(email, password);
        const signedInUser = data?.user;
        if (adminMode && !(signedInUser?.isAdmin || signedInUser?.is_admin)) {
          await signOut();
          setErrorMsg('This account is not an administrator. Use a regular account or ask an existing admin to promote it.');
          return;
        }
        navigate(adminMode ? '/admin' : '/');
      } catch (err) {
        setErrorMsg(err.message || 'An error occurred during authentication.');
      } finally {
        setSubmitting(false);
      }
    }
  };

  // Render SVG icons inside buttons
  const renderEyeIcon = (isVisible) => {
    if (isVisible) {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
      );
    }
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    );
  };

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Back to Home Button */}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="back-btn"
          aria-label="Back to home"
          style={{
            position: 'absolute',
            top: '1rem',
            left: '1rem',
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.5rem',
            borderRadius: '50%',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        {/* Brand Header */}
        <div className="login-brand">
          <div className="login-logo font-display">LEDGER</div>
          <p className="login-sub">Personal Finance &amp; AI Spending Intelligence</p>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${!isSignUp ? 'auth-tab--active' : ''}`}
            onClick={() => { setIsSignUp(false); setErrorMsg(''); setSuccessMsg(''); setErrors({}); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${isSignUp ? 'auth-tab--active' : ''}`}
            onClick={() => { setIsSignUp(true); setErrorMsg(''); setSuccessMsg(''); setErrors({}); }}
          >
            Create Account
          </button>
        </div>

        {!isSignUp && (
          <div className="admin-login-option">
            <div>
              <strong>Administrator access</strong>
              <span>Use your existing admin account to open the control panel.</span>
            </div>
            <button
              type="button"
              className={`admin-login-toggle ${adminMode ? 'admin-login-toggle--active' : ''}`}
              onClick={() => {
                setAdminMode((current) => !current);
                setErrorMsg('');
                setSuccessMsg('');
              }}
              aria-pressed={adminMode}
            >
              {adminMode ? 'Admin mode on' : 'Admin login'}
            </button>
          </div>
        )}

        {/* Messages */}
        {errorMsg && <div className="alert alert--error mb-4">{errorMsg}</div>}
        {successMsg && <div className="alert alert--success mb-4">{successMsg}</div>}

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          
          {/* Full Name (Sign Up only) */}
          {isSignUp && (
            <div className="form-group">
              <label className="form-label" htmlFor="reg-fullname">Full Name</label>
              <input
                id="reg-fullname"
                type="text"
                className="form-input"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={() => validateField('fullName', fullName)}
                required
              />
              {errors.fullName && <p style={{ color: 'var(--red-light)', fontSize: '0.725rem', marginTop: '0.25rem' }}>{errors.fullName}</p>}
            </div>
          )}

          {/* Email Address */}
          <div className="form-group">
            <label className="form-label" htmlFor="auth-email">Email Address</label>
            <input
              id="auth-email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => validateField('email', email)}
              required
            />
            {errors.email && <p style={{ color: 'var(--red-light)', fontSize: '0.725rem', marginTop: '0.25rem' }}>{errors.email}</p>}
          </div>

          {/* Password (Sign In vs Sign Up toggle keys) */}
          {!isSignUp ? (
            <div className="form-group mb-6">
              <label className="form-label" htmlFor="signin-password">Password</label>
              <div className="password-input-container">
                <input
                  id="signin-password"
                  type={showSignInPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowSignInPassword(!showSignInPassword)}
                  aria-label={showSignInPassword ? "Hide password" : "Show password"}
                >
                  {renderEyeIcon(showSignInPassword)}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Sign Up Password */}
              <div className="form-group">
                <label className="form-label" htmlFor="reg-password">Password</label>
                <div className="password-input-container">
                  <input
                    id="reg-password"
                    type={showSignUpPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => validateField('password', password)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                    aria-label={showSignUpPassword ? "Hide password" : "Show password"}
                  >
                    {renderEyeIcon(showSignUpPassword)}
                  </button>
                </div>
                {errors.password && <p style={{ color: 'var(--red-light)', fontSize: '0.725rem', marginTop: '0.25rem' }}>{errors.password}</p>}
              </div>

              {/* Confirm Password */}
              <div className="form-group mb-6">
                <label className="form-label" htmlFor="reg-confirm">Confirm Password</label>
                <div className="password-input-container">
                  <input
                    id="reg-confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onBlur={() => validateField('confirmPassword', confirmPassword)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {renderEyeIcon(showConfirmPassword)}
                  </button>
                </div>
                {errors.confirmPassword && <p style={{ color: 'var(--red-light)', fontSize: '0.725rem', marginTop: '0.25rem' }}>{errors.confirmPassword}</p>}
              </div>
            </>
          )}

          <button
            type="submit"
            className="btn btn--primary w-full"
            disabled={submitting}
          >
            {submitting
              ? (isSignUp ? 'Creating Account...' : 'Signing In...')
              : (isSignUp ? 'Create Account' : 'Sign In')}
          </button>

          <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>or</span>
            <button
              type="button"
              className="btn btn--secondary w-full"
              onClick={() => navigate('/')}
            >
              Continue as Guest (Demo Mode)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
