import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useSeo } from '../seo/useSeo';
import { useCountdown } from '../lib/useCountdown';
import { COOLDOWN_CAP_SECONDS } from '../lib/rateLimit';
import '../styles/auth.css';

const AUTH_POINTS = [
  'Expense tracking with monthly budgets',
  'AI bill and invoice scanning',
  'Ledger AI, in English, Roman Urdu or Urdu',
];

export default function LoginPage() {
  useSeo({
    title: 'Sign in | Ledger',
    description: 'Sign in to your Ledger account or create one.',
    noindex: true,
  });
  const navigate = useNavigate();
  const { user, signIn, signUp, configured } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Validation errors
  const [errors, setErrors] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  // Password visibility states
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const cooldown = useCountdown(blockedUntil);

  useEffect(() => {
    if (user && configured) {
      navigate('/overview');
    }
  }, [user, configured, navigate]);

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
    setErrors((prev) => ({ ...prev, [name]: error }));
    return error;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (cooldown > 0) return;

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
        setTimeout(() => navigate('/overview'), 600);
      } catch (err) {
        if (err.retryAfterSeconds) {
          setBlockedUntil(
            Date.now() + Math.min(err.retryAfterSeconds, COOLDOWN_CAP_SECONDS) * 1000
          );
        }
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
        await signIn(email, password);
        navigate('/overview');
      } catch (err) {
        if (err.retryAfterSeconds) {
          setBlockedUntil(
            Date.now() + Math.min(err.retryAfterSeconds, COOLDOWN_CAP_SECONDS) * 1000
          );
        }
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
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      );
    }
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  };

  const switchMode = (signUp) => {
    setIsSignUp(signUp);
    setErrorMsg('');
    setSuccessMsg('');
    setErrors({});
  };

  const fieldError = (name) =>
    errors[name] ? (
      <p className="auth-field-error" id={`${name}-error`} role="alert">
        {errors[name]}
      </p>
    ) : null;

  const passwordField = ({
    id,
    label,
    value,
    onChange,
    onBlur,
    show,
    setShow,
    placeholder,
    auto,
  }) => (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <div className="password-input-container">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          className="form-input"
          placeholder={placeholder}
          autoComplete={auto}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          required
        />
        <button
          type="button"
          className="password-toggle-btn"
          onClick={() => setShow(!show)}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {renderEyeIcon(show)}
        </button>
      </div>
    </div>
  );

  return (
    <div className="auth-shell">
      <aside className="auth-aside" aria-label="About Ledger">
        <div className="auth-aside-inner">
          <a className="auth-brand" href="/" aria-label="Ledger home">
            <span className="auth-mark">L</span>
            <span>LEDGER</span>
          </a>

          <div className="auth-pitch">
            <h2>Know where your money goes.</h2>
            <p>
              Track expenses, scan bills with AI, and ask questions about your spending, all in one
              place.
            </p>
            <ul className="auth-points">
              {AUTH_POINTS.map((point) => (
                <li key={point}>
                  <span className="auth-tick" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="m5 12 4 4L19 6" />
                    </svg>
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <p className="auth-aside-note">
            Passwords are hashed and every record is private to your account.
          </p>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="auth-back"
            aria-label="Back to home"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back to home
          </button>

          <div className="auth-heading">
            <h1>{isSignUp ? 'Create your account' : 'Welcome back'}</h1>
            <p>
              {isSignUp
                ? 'Start tracking your money in under a minute.'
                : 'Sign in to continue to your ledger.'}
            </p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Sign in or create account">
            <button
              type="button"
              role="tab"
              aria-selected={!isSignUp}
              className={`auth-tab ${!isSignUp ? 'auth-tab--active' : ''}`}
              onClick={() => switchMode(false)}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isSignUp}
              className={`auth-tab ${isSignUp ? 'auth-tab--active' : ''}`}
              onClick={() => switchMode(true)}
            >
              Create Account
            </button>
          </div>

          {errorMsg && (
            <div className="alert alert--error mb-4" role="alert">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="alert alert--success mb-4" role="status">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            {isSignUp && (
              <div className="form-group">
                <label className="form-label" htmlFor="reg-fullname">
                  Full Name
                </label>
                <input
                  id="reg-fullname"
                  type="text"
                  className="form-input"
                  placeholder="Your full name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={() => validateField('fullName', fullName)}
                  aria-invalid={Boolean(errors.fullName)}
                  required
                />
                {fieldError('fullName')}
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="auth-email">
                Email Address
              </label>
              <input
                id="auth-email"
                type="email"
                className="form-input"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => validateField('email', email)}
                aria-invalid={Boolean(errors.email)}
                required
              />
              {fieldError('email')}
            </div>

            {!isSignUp ? (
              passwordField({
                id: 'signin-password',
                label: 'Password',
                value: password,
                onChange: setPassword,
                show: showSignInPassword,
                setShow: setShowSignInPassword,
                placeholder: 'Enter your password',
                auto: 'current-password',
              })
            ) : (
              <>
                <div>
                  {passwordField({
                    id: 'reg-password',
                    label: 'Password',
                    value: password,
                    onChange: setPassword,
                    onBlur: () => validateField('password', password),
                    show: showSignUpPassword,
                    setShow: setShowSignUpPassword,
                    placeholder: 'At least 8 characters',
                    auto: 'new-password',
                  })}
                  {fieldError('password')}
                </div>
                <div>
                  {passwordField({
                    id: 'reg-confirm',
                    label: 'Confirm Password',
                    value: confirmPassword,
                    onChange: setConfirmPassword,
                    onBlur: () => validateField('confirmPassword', confirmPassword),
                    show: showConfirmPassword,
                    setShow: setShowConfirmPassword,
                    placeholder: 'Re-enter your password',
                    auto: 'new-password',
                  })}
                  {fieldError('confirmPassword')}
                </div>
              </>
            )}

            <button
              type="submit"
              className="btn btn--primary w-full auth-submit"
              disabled={submitting || cooldown > 0}
            >
              {cooldown > 0
                ? `Try again in ${cooldown}s`
                : submitting
                  ? isSignUp
                    ? 'Creating account...'
                    : 'Signing in...'
                  : isSignUp
                    ? 'Create account'
                    : 'Sign in'}
            </button>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <button
              type="button"
              className="btn btn--secondary w-full"
              onClick={() => navigate('/overview')}
            >
              Continue as Guest (Demo Mode)
            </button>
            <p className="auth-hint">Guest mode keeps your data in this browser only.</p>
          </form>
        </div>
      </main>
    </div>
  );
}
