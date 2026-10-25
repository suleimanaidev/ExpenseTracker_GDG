import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { prefersReducedMotion } from '../lib/motion';
import { useReveal } from '../lib/useReveal';
import { DEFINITION, FAQ, SITE, faqJsonLd, howToJsonLd } from '../seo/content';
import { useJsonLd, useSeo } from '../seo/useSeo';
import ThemeToggleMouse from '../components/ThemeToggleMouse';
import '../styles/landing.css';

// Built once: static data, so the structured-data hook can safely run only on mount.
const PAGE_JSON_LD = [faqJsonLd(), howToJsonLd()];

const Check = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m5 12 4 4L19 6" />
  </svg>
);
const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const enterApp = () => navigate(user ? '/overview' : '/login');
  const rootRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);

  useSeo({ title: SITE.title, description: SITE.description });
  useJsonLd(PAGE_JSON_LD);
  useReveal(rootRef);

  // The bar picks up a surface and a hairline once content scrolls under it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll progress and pointer parallax write CSS variables directly, so neither
  // re-renders the page on every frame.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return undefined;

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      root.style.setProperty('--scroll', max > 0 ? String(window.scrollY / max) : '0');
    };
    const onPointer = (event) => {
      root.style.setProperty('--mx', String((event.clientX / window.innerWidth - 0.5) * 2));
      root.style.setProperty('--my', String((event.clientY / window.innerHeight - 0.5) * 2));
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointer);
    };
  }, []);

  return (
    <div className="fin-landing" ref={rootRef}>
      <div className="fin-progress" aria-hidden="true" />
      <header className={`fin-nav${scrolled ? ' is-scrolled' : ''}`}>
        <div className="fin-shell fin-nav-inner">
          <a className="fin-brand" href="#top" aria-label="Ledger home">
            <span className="fin-brand-mark">L</span>
            <span>LEDGER</span>
          </a>
          <nav className="fin-links" aria-label="Landing page navigation">
            <a href="#features">Features</a>
            <a href="#bills">Bill scan</a>
            <a href="#security">Security</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="fin-nav-actions">
            <ThemeToggleMouse />
            <button className="fin-button fin-button--small" onClick={enterApp}>
              {user ? 'Open dashboard' : 'Start tracking'}
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="fin-hero">
          <div className="fin-orbit fin-orbit--one" />
          <div className="fin-orbit fin-orbit--two" />
          <div className="fin-shell fin-hero-grid">
            <div className="fin-hero-copy">
              <div className="fin-kicker">
                <span /> Money management for real life
              </div>
              <h1>
                Feel good about
                <br />
                <em>where your money goes.</em>
              </h1>
              <p>{DEFINITION}</p>
              <div className="fin-hero-actions">
                <button className="fin-button fin-button--primary" onClick={enterApp}>
                  {user ? 'Go to your ledger' : 'Create your free ledger'} <Arrow />
                </button>
                <a className="fin-text-link" href="#features">
                  Explore features
                </a>
              </div>
              <div className="fin-trust-row">
                <span>
                  <Check /> Bill-to-expense automation
                </span>
                <span>
                  <Check /> Duplicate protection
                </span>
              </div>
            </div>

            <div
              className="fin-hero-visual"
              aria-label="Illustration of the Ledger finance dashboard"
            >
              <div className="fin-glow" />
              <img
                className="fin-hero-image"
                src="/images/ledger-bill-hero-warm.webp"
                width="1200"
                height="675"
                fetchPriority="high"
                decoding="async"
                alt="A bill scanner turning a paper bill into organized financial data"
              />
            </div>
          </div>
        </section>

        <section className="fin-proof">
          <div className="fin-shell fin-proof-grid" data-reveal="stagger">
            <div>
              <strong>One view</strong>
              <span>Expenses, bills &amp; budgets</span>
            </div>
            <div>
              <strong>One scan</strong>
              <span>Document to reviewed record</span>
            </div>
            <div>
              <strong>One source</strong>
              <span>Bill and expense stay linked</span>
            </div>
          </div>
        </section>

        <section id="features" className="fin-section">
          <div className="fin-shell">
            <div className="fin-section-heading" data-reveal>
              <div>
                <span className="fin-eyebrow">BUILT FOR EVERYDAY MONEY</span>
                <h2>
                  Made for the way
                  <br />
                  life actually happens.
                </h2>
              </div>
              <p>
                Groceries, subscriptions, utility bills, and everything between them. Ledger turns
                daily activity into a financial picture you can understand at a glance.
              </p>
            </div>
            <div className="fin-feature-grid" data-reveal="stagger">
              <article className="fin-feature-card">
                <div className="fin-feature-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-7" />
                  </svg>
                </div>
                <span>01</span>
                <h3>Expense tracking</h3>
                <p>Record spending quickly and organize every transaction by category and date.</p>
              </article>
              <article className="fin-feature-card fin-feature-card--accent">
                <div className="fin-feature-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6" />
                  </svg>
                </div>
                <span>02</span>
                <h3>AI bill scanning</h3>
                <p>Upload a bill, review the details, and create its linked expense in one flow.</p>
              </article>
              <article className="fin-feature-card">
                <div className="fin-feature-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 3 4 7v5c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V7l-8-4Z" />
                    <path d="m9 12 2 2 4-5" />
                  </svg>
                </div>
                <span>03</span>
                <h3>Duplicate protection</h3>
                <p>
                  Server-side checks stop the same invoice from creating another bill or expense.
                </p>
              </article>
              <article className="fin-feature-card">
                <div className="fin-feature-icon">
                  <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </div>
                <span>04</span>
                <h3>Budget guidance</h3>
                <p>See what remains, receive warnings, and know what is safe to spend today.</p>
              </article>
              <article className="fin-feature-card">
                <div className="fin-feature-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="m12 3-2 6-6 2 6 2 2 6 2-6 6-2-6-2-2-6Z" />
                  </svg>
                </div>
                <span>05</span>
                <h3>Ledger AI</h3>
                <p>
                  Ask about your spending in English, Roman Urdu or Urdu, by typing or by voice.
                </p>
              </article>
              <article className="fin-feature-card">
                <div className="fin-feature-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M5 20V10M12 20V4M19 20v-7" />
                  </svg>
                </div>
                <span>06</span>
                <h3>Useful analytics</h3>
                <p>Compare months, explore category pressure, and identify spending patterns.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="bills" className="fin-section fin-bills">
          <div className="fin-shell fin-bills-grid">
            <div className="fin-bill-demo" data-reveal="left">
              <div className="fin-paper">
                <div className="fin-paper-head">
                  <span>UTILITY BILL</span>
                  <b>PKR</b>
                </div>
                <div className="fin-paper-vendor">K-Electric</div>
                <div className="fin-paper-rule" />
                <div className="fin-paper-row">
                  <span>Billing period</span>
                  <b>October</b>
                </div>
                <div className="fin-paper-row">
                  <span>Amount due</span>
                  <b>8,420.00</b>
                </div>
                <div className="fin-paper-row">
                  <span>Due date</span>
                  <b>18 Oct</b>
                </div>
                <div className="fin-scan-line" />
              </div>
              <div className="fin-data-card">
                <span>Expense created</span>
                <strong>Utilities · PKR 8,420</strong>
                <small>Bill and transaction linked</small>
              </div>
            </div>
            <div className="fin-bills-copy" data-reveal>
              <span className="fin-eyebrow">FROM DOCUMENT TO DECISION</span>
              <h2>
                Upload the bill.
                <br />
                Ledger does the filing.
              </h2>
              <p>
                Add a JPG, PNG, WEBP, or PDF from Transactions → Add Bill. Review the extracted
                details, then save one clean bill with one linked expense. Anything that is not a
                bill is rejected with an explanation.
              </p>
              <ol>
                <li>
                  <b>01</b>
                  <div>
                    <strong>Scan intelligently</strong>
                    <span>
                      Vendor, amount, dates, currency, and line items are extracted for review.
                    </span>
                  </div>
                </li>
                <li>
                  <b>02</b>
                  <div>
                    <strong>Stay in control</strong>
                    <span>Edit every field before anything is saved.</span>
                  </div>
                </li>
                <li>
                  <b>03</b>
                  <div>
                    <strong>Never count it twice</strong>
                    <span>
                      Server-side duplicate protection blocks repeat bills across every upload flow.
                    </span>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section id="security" className="fin-section fin-security">
          <div className="fin-shell fin-security-card" data-reveal>
            <div className="fin-lock">
              <svg viewBox="0 0 24 24">
                <rect x="4" y="10" width="16" height="11" rx="3" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
              </svg>
            </div>
            <div>
              <span className="fin-eyebrow">PRIVATE BY DESIGN</span>
              <h2>Your ledger belongs to you.</h2>
            </div>
            <p>
              Authenticated access, owner-scoped records, validated uploads, and protected document
              downloads keep each account’s financial data separated.
            </p>
          </div>
        </section>

        <section id="faq" className="fin-section fin-faq" aria-labelledby="faq-title">
          <div className="fin-shell">
            <div className="fin-section-heading fin-section-heading--center" data-reveal>
              <div>
                <span className="fin-eyebrow">QUESTIONS, ANSWERED</span>
                <h2 id="faq-title">Everything you need to know.</h2>
              </div>
              <p>Short, direct answers about how Ledger works and what happens to your data.</p>
            </div>
            <div className="fin-faq-list" data-reveal="stagger">
              {FAQ.map((item) => (
                <details className="fin-faq-item" name="faq" key={item.id}>
                  <summary>
                    <h3>{item.question}</h3>
                    <span className="fin-faq-icon" aria-hidden="true" />
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="fin-cta">
          <div className="fin-shell fin-cta-panel" data-reveal>
            <div className="fin-cta-copy">
              <span className="fin-eyebrow">START WITH TODAY</span>
              <h2>Clarity compounds.</h2>
              <p>Build a calmer relationship with your money, one expense at a time.</p>
              <button className="fin-button fin-button--light" onClick={enterApp}>
                {user ? 'Open your dashboard' : 'Start your ledger'} <Arrow />
              </button>
            </div>
            <div className="fin-cta-path" aria-label="What you can do in Ledger">
              <div>
                <b>01</b>
                <span>
                  <strong>Track today</strong>
                  <small>Record daily spending in seconds</small>
                </span>
                <i>
                  <Check />
                </i>
              </div>
              <div>
                <b>02</b>
                <span>
                  <strong>Scan the paperwork</strong>
                  <small>Turn a reviewed bill into an expense</small>
                </span>
                <i>
                  <Check />
                </i>
              </div>
              <div>
                <b>03</b>
                <span>
                  <strong>Understand the month</strong>
                  <small>See patterns before they become surprises</small>
                </span>
                <i>
                  <Check />
                </i>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="fin-footer fin-foot">
        <div className="fin-shell fin-foot-grid">
          <div className="fin-foot-brand">
            <a className="fin-brand" href="#top" aria-label="Ledger home">
              <span className="fin-brand-mark">L</span>
              <span>LEDGER</span>
            </a>
            <p>
              Track expenses, scan bills with AI, and understand your monthly spending in one place.
            </p>
            <ul className="fin-foot-currencies" aria-label="Supported currencies">
              {['PKR', 'USD', 'EUR', 'GBP', 'INR'].map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
          </div>

          <nav className="fin-foot-col" aria-label="Product">
            <strong>Product</strong>
            <a href="#features">Features</a>
            <a href="#bills">Bill scanning</a>
            <a href="#security">Security</a>
            <a href="#faq">FAQ</a>
          </nav>

          <nav className="fin-foot-col" aria-label="Account">
            <strong>Account</strong>
            <button type="button" onClick={() => navigate('/login')}>
              Sign in
            </button>
            <button type="button" onClick={enterApp}>
              {user ? 'Open dashboard' : 'Create account'}
            </button>
            <button type="button" onClick={() => navigate('/overview')}>
              Try demo mode
            </button>
          </nav>

          <div className="fin-foot-col">
            <strong>Your data</strong>
            <span className="fin-foot-fact">Private to your account</span>
            <span className="fin-foot-fact">Passwords are hashed</span>
            <span className="fin-foot-fact">You review every AI scan</span>
          </div>
        </div>

        <div className="fin-shell fin-foot-bottom">
          <small>© 2026 Ledger. Personal finance, clearly.</small>
          <a href="#top">
            Back to top <span aria-hidden="true">↑</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
