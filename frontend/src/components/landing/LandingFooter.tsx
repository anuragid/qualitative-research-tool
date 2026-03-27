import { useRef, useEffect, useState } from 'react';
import { Logo } from '../ui/logo';
import { useTextScramble } from '../../hooks/useTextScramble';
import { gsap } from '../../lib/animations';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface LandingFooterProps {
  scrollToSection: (id: string) => void;
}

const CREDITS_TEXT = 'Built at the Institute of Design, Illinois Institute of Technology';

export function LandingFooter({ scrollToSection }: LandingFooterProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [creditsResolved, setCreditsResolved] = useState(false);
  const hasTriggered = useRef(false);

  const copyrightScramble = useTextScramble(
    `\u00A9 ${new Date().getFullYear()} methodex. All rights reserved.`,
    { duration: 0.6 },
  );
  const creditsScramble = useTextScramble(CREDITS_TEXT, {
    duration: 0.6,
    onComplete: () => setCreditsResolved(true),
  });

  // Store replay fns in refs so the ScrollTrigger effect doesn't re-run
  const copyrightReplayRef = useRef(copyrightScramble.replay);
  const creditsReplayRef = useRef(creditsScramble.replay);
  copyrightReplayRef.current = copyrightScramble.replay;
  creditsReplayRef.current = creditsScramble.replay;

  // Trigger scramble on scroll-in — only once
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;

    const trigger = ScrollTrigger.create({
      trigger: el,
      start: 'top 90%',
      once: true,
      onEnter: () => {
        if (hasTriggered.current) return;
        hasTriggered.current = true;
        copyrightReplayRef.current();
        setTimeout(() => creditsReplayRef.current(), 300);
      },
    });

    return () => trigger.kill();
  }, []);

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
              Your research toolkit, digitized. Transform qualitative research data into structured
              insights with proven analytical frameworks.
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
        <div className="footer-bottom" ref={bottomRef}>
          <p
            className="footer-copyright"
            ref={copyrightScramble.ref as React.RefObject<HTMLParagraphElement>}
          />
          <p className="footer-credits">
            {creditsResolved ? (
              <>
                Built at the{' '}
                <a href="https://id.iit.edu" target="_blank" rel="noopener noreferrer">
                  Institute of Design, Illinois Institute of Technology
                </a>
              </>
            ) : (
              <span ref={creditsScramble.ref as React.RefObject<HTMLSpanElement>} />
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
