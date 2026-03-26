import { Logo } from '../ui/logo';

interface LandingFooterProps {
  scrollToSection: (id: string) => void;
}

export function LandingFooter({ scrollToSection }: LandingFooterProps) {
  return (
    <footer className="footer">
      <div className="footer-texture" aria-hidden="true">
        <img src="/landing/paper-black.png" alt="" loading="lazy" />
      </div>
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="footer-logo">
              <Logo size="sidebar" className="text-white" />
            </div>
            <p className="footer-tagline">
              Your research toolkit, digitized. Transform qualitative research with proven
              analytical frameworks.
            </p>
          </div>
          <div className="footer-links">
            <div className="footer-col">
              <h4>Product</h4>
              <ul>
                <li>
                  <button onClick={() => scrollToSection('collection')}>Methods</button>
                </li>
                <li>
                  <button onClick={() => scrollToSection('features')}>Features</button>
                </li>
                <li>
                  <button onClick={() => scrollToSection('upcoming')}>Upcoming</button>
                </li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Resources</h4>
              <ul>
                <li>
                  <button onClick={() => scrollToSection('about')}>About</button>
                </li>
                <li>
                  <button onClick={() => scrollToSection('contact')}>Contact</button>
                </li>
                <li>
                  <a href="https://id.iit.edu" target="_blank" rel="noopener noreferrer">
                    Institute of Design
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p className="footer-copyright">
            &copy; {new Date().getFullYear()} methodex. All rights reserved.
          </p>
          <p className="footer-credits">
            Built at the{' '}
            <a href="https://id.iit.edu" target="_blank" rel="noopener noreferrer">
              Institute of Design, Illinois Institute of Technology
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
