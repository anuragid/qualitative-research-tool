import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../ui/logo';

interface LandingNavProps {
  isSignedIn: boolean;
  scrollToSection: (id: string) => void;
}

const NAV_ITEMS = [
  { label: 'Methods', id: 'collection' },
  { label: 'Features', id: 'features' },
  { label: 'Upcoming', id: 'upcoming' },
  { label: 'About', id: 'about' },
  { label: 'Contact', id: 'contact' },
];

export function LandingNav({ isSignedIn, scrollToSection }: LandingNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Body scroll lock when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const handleNavClick = useCallback(
    (id: string) => {
      scrollToSection(id);
      setMobileMenuOpen(false);
    },
    [scrollToSection],
  );

  return (
    <>
      <nav className={`nav${scrolled ? ' scrolled' : ''}`} aria-label="Main navigation">
        <div className="nav-inner">
          <button
            className="nav-logo"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="methodex home"
          >
            <Logo size="sidebar" className="text-[var(--color-ink)]" />
          </button>

          <ul className="nav-links">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <button
                  className="nav-link"
                  onClick={() => handleNavClick(item.id)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>

          {isSignedIn ? (
            <Link to="/projects" className="nav-cta desktop-only">
              Go to Projects
            </Link>
          ) : (
            <Link to="/sign-up" className="nav-cta desktop-only">
              Get Started
            </Link>
          )}

          <button
            className="nav-hamburger"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="3" y1="6" x2="17" y2="6" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="14" x2="17" y2="14" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile Nav Overlay */}
      <div className={`nav-mobile-overlay${mobileMenuOpen ? ' open' : ''}`}>
        <button
          className="nav-mobile-close"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close menu"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
        <div className="nav-mobile-content">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className="nav-mobile-link"
              onClick={() => handleNavClick(item.id)}
            >
              {item.label}
            </button>
          ))}
          {isSignedIn ? (
            <Link
              to="/projects"
              className="nav-cta"
              style={{ marginTop: 16, height: 48, padding: '0 32px', fontSize: 16 }}
            >
              Go to Projects
            </Link>
          ) : (
            <Link
              to="/sign-up"
              className="nav-cta"
              style={{ marginTop: 16, height: 48, padding: '0 32px', fontSize: 16 }}
            >
              Get Started
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
