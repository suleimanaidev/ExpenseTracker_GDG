import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import ThemeToggleMouse from '../components/ThemeToggleMouse';

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleGetStarted = () => {
    if (user) {
      navigate('/');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="landing-layout">
      {/* Header */}
      <header className="landing-header">
        <div className="landing-container flex-between">
          <div className="landing-brand flex-align">
            <svg className="brand-logo-svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z"/>
              <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>
            </svg>
            <span className="brand-name font-display">LEDGER</span>
          </div>
          <nav className="landing-nav-links">
            <a href="#features">Features</a>
            <a href="#showcase">Dashboard</a>
            <a href="#security">Security</a>
          </nav>
          {/* Theme toggle sits before the CTA so the primary action keeps the
              far-right edge of the header. Landing and the app shell are on
              separate routes, so both copies of the toggle are never mounted at
              the same time; each reads and writes the same localStorage key. */}
          <div className="landing-header-actions">
            <ThemeToggleMouse />
            <button className="btn btn--gold btn--sm header-cta" onClick={handleGetStarted}>
              {user ? 'Enter App' : 'Get Started'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-container">
          <h1 className="hero-title font-display animate-fade-in delay-1">
            Own your cash flow.<br />
            <span>Predict your spend.</span>
          </h1>
          
          <p className="hero-subtitle animate-fade-in delay-2">
            Ditch the toxic spreadsheets. Track your cash without the trauma. A premium personal finance vault merging speed with next-gen AI spend prediction so you never have to skip your iced coffee.
          </p>
          
          <div className="hero-actions animate-fade-in delay-3">
            <button className="btn btn--green btn--lg hero-btn-glow" onClick={handleGetStarted}>
              {user ? 'Open Dashboard' : 'Start Your Ledger'}
            </button>
            {!user && (
              <button className="btn btn--ghost btn--lg btn--outline" onClick={() => navigate('/login')}>
                Sign In
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Interactive Feature Cards */}
      <section id="features" className="landing-features">
        <div className="landing-container">
          <div className="section-header text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="hero-badge" style={{ width: 'fit-content' }}>JUST STATS</div>
            <h2 className="section-title font-sans" style={{ fontFamily: 'var(--font-sans)', fontWeight: 700 }}>Crafted for elegant financial control.</h2>
          </div>
          
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon-wrapper color-cyan">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
                </svg>
              </div>
              <h3 className="feature-title font-display">Lag-Free Charts</h3>
              <p className="feature-text">
                Sleek, responsive charts rendered on HTML5 Canvas. Pure money aesthetics, zero lag, zero clutter to visualize your spending trends.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrapper color-gold">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                </svg>
              </div>
              <h3 className="feature-title font-display">Predictive AI Runway</h3>
              <p className="feature-text">
                Your transaction history analyzed server-side to forecast when you'll run out of budget. Actionable saving advice, no judgment.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrapper color-green">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <h3 className="feature-title font-display">Vault-Grade Security</h3>
              <p className="feature-text">
                Isolated workspaces with MongoDB document-level scoping and strict database policies. Your ledger is 100% locked and protected.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrapper color-blue">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h3 className="feature-title font-display">Vibe Check with AI</h3>
              <p className="feature-text">
                Chat directly with your spending history. Ask "Can I afford a new phone?" or "Where did my cash go?" and get instant answers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Showcase Dashboard Section */}
      <section id="showcase" className="landing-showcase">
        <div className="landing-container">
          <div className="section-header text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="hero-badge" style={{ width: 'fit-content' }}>DASHBOARD INTERFACE</div>
            <h2 className="section-title font-sans" style={{ fontFamily: 'var(--font-sans)', fontWeight: 700 }}>Your financial command center.</h2>
            <p className="hero-subtitle" style={{ maxWidth: '720px', margin: '1rem auto 0' }}>
              Track your expenses with real-time indicators and dynamic warning thresholds designed to prevent budget overflows before they happen.
            </p>
          </div>

          <div className="showcase-layout flex-col text-center" style={{ marginTop: '2rem' }}>
            <div className="showcase-content" style={{ maxWidth: '800px', margin: '0 auto 2rem' }}>
              <ul className="showcase-list" style={{ display: 'flex', justifyContent: 'center', gap: '2.5rem', flexWrap: 'wrap' }}>
                <li style={{ margin: 0, color: 'var(--text-primary)' }}>
                  <svg className="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  Daily Safe-To-Spend Banners
                </li>
                <li style={{ margin: 0, color: 'var(--text-primary)' }}>
                  <svg className="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  Weekly Heatmap &amp; Category distributions
                </li>
                <li style={{ margin: 0, color: 'var(--text-primary)' }}>
                  <svg className="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  Budget overflow warning systems
                </li>
              </ul>
            </div>
            
            <div className="showcase-preview-wrapper" style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
              <div className="glow-behind"></div>
              <div className="dashboard-mockup">
                {/* Mockup Header */}
                <div className="mockup-header flex-between">
                  <span className="dot-group">
                    <span className="dot red"></span>
                    <span className="dot yellow"></span>
                    <span className="dot green"></span>
                  </span>
                  <span className="mockup-title">overview | ledger</span>
                </div>
                {/* Mockup Dashboard Body */}
                <div className="mockup-body">
                  <div className="mockup-grid">
                    <div className="mockup-card">
                      <div className="mockup-card-label">Spent This Month</div>
                      <div className="mockup-card-value">PKR 34,200</div>
                    </div>
                    <div className="mockup-card highlight">
                      <div className="mockup-card-label">Remaining Budget</div>
                      <div className="mockup-card-value">PKR 15,800</div>
                    </div>
                  </div>
                  
                  <div className="mockup-banner">
                    <div>
                      <div className="mockup-card-label">Safe-to-Spend Daily Banner</div>
                      <div className="mockup-banner-sub">Stay on track for this month</div>
                    </div>
                    <div className="mockup-banner-value">PKR 1,053</div>
                  </div>

                  <div className="mockup-insight-box">
                    <div className="insight-title flex-align">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                      </svg>
                      AI Financial Analysis
                    </div>
                    <p className="insight-body">
                      Your top spending category is <strong>Food &amp; Dining (PKR 12,000)</strong>. You are currently on track for your budget of PKR 50,000. Your budget runway is estimated to last until <strong>August 30th</strong> if current spending trends persist.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security Info Section */}
      <section id="security" className="landing-security">
        <div className="landing-container text-center">
          <div className="section-header text-center" style={{ marginBottom: '2.5rem' }}>
            <div className="hero-badge">SECURITY VAULT</div>
            <h2 className="section-title font-display">Isolated. Encrypted. Protected.</h2>
          </div>
          <p className="security-subtitle" style={{ marginTop: 0 }}>
            All user databases operate with strict isolation policies. Your account email, joined dates, and transaction rows are dynamically checked at the database layer using MongoDB document scoping. Your private keys never touch the client build.
          </p>
          
          <div className="security-shield-wrapper">
            <div className="shield-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
          </div>
        </div>
      </section>


      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container flex-between flex-wrap gap-4 text-center-mobile">
          <span className="footer-logo font-display">LEDGER</span>
          <span className="footer-text text-sm text-muted">
            © 2026 Ledger Inc.
          </span>
        </div>
      </footer>
    </div>
  );
}
