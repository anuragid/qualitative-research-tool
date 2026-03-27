import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { gsap, useGSAP, prefersReducedMotion } from '../../lib/animations';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface HeroSectionProps {
  isSignedIn: boolean;
}

const HEADLINE_WORDS = ['Your', 'research', 'toolkit,'];
const HEADLINE_EM = 'digitized';

export function HeroSection({ isSignedIn }: HeroSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const productRef = useRef<HTMLDivElement>(null);
  const papersRef = useRef<HTMLDivElement>(null);
  const cloud1Ref = useRef<HTMLImageElement>(null);
  const cloud2Ref = useRef<HTMLImageElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;

      // ── Hero entrance timeline ──
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

      // 1. Word stagger
      const words = headlineRef.current?.querySelectorAll('.hero-word');
      if (words?.length) {
        gsap.set(words, { y: 20, opacity: 0 });
        tl.to(words, {
          y: 0,
          opacity: 1,
          duration: 0.35,
          stagger: 0.06,
        });
        // The em word gets slightly longer duration — target it specifically
        const emWord = headlineRef.current?.querySelector('.hero-word-em');
        if (emWord) {
          gsap.set(emWord, { y: 20, opacity: 0 });
          tl.to(
            emWord,
            { y: 0, opacity: 1, duration: 0.5 },
            '<0.06', // start 0.06s after last word begins
          );
        }
      }

      // 2. Subtitle + CTA
      gsap.set([subtitleRef.current, ctaRef.current], { opacity: 0 });
      tl.to([subtitleRef.current, ctaRef.current], {
        opacity: 1,
        duration: 0.4,
      }, '>-0.1');

      // 3. Product mockup
      gsap.set(productRef.current, { y: 60, opacity: 0 });
      tl.to(productRef.current, {
        y: 0,
        opacity: 1,
        duration: 0.8,
      }, '>-0.2');

      // 4. Video cards stagger
      const cards = productRef.current?.querySelectorAll('.hero-app-card');
      if (cards?.length) {
        gsap.set(cards, { y: 16, opacity: 0 });
        tl.to(cards, {
          y: 0,
          opacity: 1,
          duration: 0.35,
          stagger: 0.12,
        }, '>-0.3');
      }

      // ── Parallax: paper pieces ──
      const paperSpeeds = [
        { selector: '.paper-0', y: -30 },
        { selector: '.paper-1', y: -50 },
        { selector: '.paper-2', y: -60 },
        { selector: '.paper-3', y: -40 },
        { selector: '.paper-4', y: -80 },
      ];
      const papersEl = papersRef.current;
      if (papersEl) {
        paperSpeeds.forEach(({ selector, y }) => {
          const piece = papersEl.querySelector(selector);
          if (piece) {
            gsap.to(piece, {
              y,
              ease: 'none',
              scrollTrigger: {
                trigger: sectionRef.current,
                start: 'top top',
                end: 'bottom top',
                scrub: true,
              },
            });
          }
        });
      }

      // ── Parallax: clouds ──
      if (cloud1Ref.current) {
        gsap.to(cloud1Ref.current, {
          x: -40,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
          },
        });
      }
      if (cloud2Ref.current) {
        gsap.to(cloud2Ref.current, {
          x: 40,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
          },
        });
      }
    },
    { scope: sectionRef },
  );

  return (
    <section className="hero" id="hero" ref={sectionRef}>
      {/* Layer 1: Sky gradient */}
      <div className="hero-sky" aria-hidden="true" />

      {/* Layer 2: White wash at bottom */}
      <div className="hero-wash" aria-hidden="true" />

      {/* Layer 3: Paper texture overlay */}
      <div className="hero-texture" aria-hidden="true">
        <img src="/landing/paper-texture.png" alt="" loading="eager" />
      </div>

      {/* Layer 4: Edge clouds */}
      <img ref={cloud1Ref} src="/landing/cloud.png" alt="" className="hero-cloud hero-cloud-1" loading="eager" aria-hidden="true" />
      <img ref={cloud2Ref} src="/landing/cloud.png" alt="" className="hero-cloud hero-cloud-2" loading="eager" aria-hidden="true" />

      {/* Content */}
      <div className="hero-content">
        <h1 ref={headlineRef}>
          {HEADLINE_WORDS.map((word, i) => (
            <span key={i} className="hero-word" style={{ display: 'inline-block', marginRight: '0.25em' }}>
              {word}
            </span>
          ))}
          <em className="hero-word hero-word-em" style={{ display: 'inline-block' }}>{HEADLINE_EM}</em>
        </h1>
        <p className="hero-subtitle" ref={subtitleRef}>
          Transform qualitative research data into structured insights using proven analytical frameworks.
        </p>
        <div className="hero-cta-group" ref={ctaRef}>
          <Link to={isSignedIn ? '/projects' : '/sign-up'} className="glass-btn">
            <span>Get Started Free</span>
          </Link>
        </div>
      </div>

      {/* Product screenshot mockup */}
      <div className="hero-product" ref={productRef}>
        <div className="hero-app-bar">
          <span className="hero-app-dot hero-app-dot-r" />
          <span className="hero-app-dot hero-app-dot-y" />
          <span className="hero-app-dot hero-app-dot-g" />
          <span className="hero-app-title">methodex</span>
        </div>
        <div className="hero-product-inner">
          <div className="hero-app-content">
            <div className="hero-app-sidebar">
              <div className="hero-app-sidebar-header">Projects</div>
              <div className="hero-app-sidebar-item active">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M1.5 3.5C1.5 2.67 2.17 2 3 2h2.59c.4 0 .78.16 1.06.44L7.71 3.5H11c.83 0 1.5.67 1.5 1.5v5.5c0 .83-.67 1.5-1.5 1.5H3c-.83 0-1.5-.67-1.5-1.5V3.5z" fill="currentColor" opacity="0.7" />
                </svg>
                Kitchen Study
              </div>
              <div className="hero-app-sidebar-item">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M1.5 3.5C1.5 2.67 2.17 2 3 2h2.59c.4 0 .78.16 1.06.44L7.71 3.5H11c.83 0 1.5.67 1.5 1.5v5.5c0 .83-.67 1.5-1.5 1.5H3c-.83 0-1.5-.67-1.5-1.5V3.5z" fill="currentColor" opacity="0.5" />
                </svg>
                User Onboarding
              </div>
              <div className="hero-app-sidebar-item">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M1.5 3.5C1.5 2.67 2.17 2 3 2h2.59c.4 0 .78.16 1.06.44L7.71 3.5H11c.83 0 1.5.67 1.5 1.5v5.5c0 .83-.67 1.5-1.5 1.5H3c-.83 0-1.5-.67-1.5-1.5V3.5z" fill="currentColor" opacity="0.5" />
                </svg>
                Healthcare UX
              </div>
            </div>
            <div className="hero-app-main">
              <div className="hero-app-main-header">
                <h4>Kitchen Study</h4>
                <p className="hero-app-main-subtitle">3 videos &middot; 1 analyzed, 1 in progress, 1 ready</p>
              </div>
              <div className="hero-app-cards">
                {/* Card 1: Analysis complete */}
                <div className="hero-app-card">
                  <div className="hero-app-card-thumb" />
                  <div className="hero-app-card-body">
                    <div className="hero-app-card-title">Interview &mdash; Sarah M.</div>
                    <div className="hero-app-card-status">
                      <span className="hero-app-status-dot" />
                      Analysis complete
                    </div>
                    <div className="hero-app-card-steps">
                      <span className="hero-app-step" style={{ background: '#5A8DB8' }} title="Chunk" />
                      <span className="hero-app-step" style={{ background: '#5D9F55' }} title="Infer" />
                      <span className="hero-app-step" style={{ background: '#C8A848' }} title="Relate" />
                      <span className="hero-app-step" style={{ background: '#A11735' }} title="Explain" />
                      <span className="hero-app-step" style={{ background: '#8B6BAE' }} title="Activate" />
                    </div>
                  </div>
                </div>
                {/* Card 2: In progress */}
                <div className="hero-app-card">
                  <div className="hero-app-card-thumb" />
                  <div className="hero-app-card-body">
                    <div className="hero-app-card-title">Interview &mdash; James K.</div>
                    <div className="hero-app-card-status">
                      <span
                        className="hero-app-status-dot"
                        style={{ background: '#F59E0B', animation: 'amberPulse 2s ease-in-out infinite' }}
                      />
                      Step 3 of 5
                    </div>
                    <div className="hero-app-card-steps">
                      <span className="hero-app-step" style={{ background: '#5A8DB8' }} />
                      <span className="hero-app-step" style={{ background: '#5D9F55' }} />
                      <span className="hero-app-step" style={{ background: '#C8A848' }} />
                      <span className="hero-app-step" style={{ background: '#D4D4D4' }} />
                      <span className="hero-app-step" style={{ background: '#D4D4D4' }} />
                    </div>
                  </div>
                </div>
                {/* Card 3: Ready to analyze */}
                <div className="hero-app-card">
                  <div className="hero-app-card-thumb" />
                  <div className="hero-app-card-body">
                    <div className="hero-app-card-title">Observation &mdash; Lab #2</div>
                    <div className="hero-app-card-status">
                      <span className="hero-app-status-dot" style={{ background: '#9CA3AF' }} />
                      Ready to analyze
                    </div>
                    <div className="hero-app-card-steps">
                      <span className="hero-app-step" style={{ background: '#D4D4D4' }} />
                      <span className="hero-app-step" style={{ background: '#D4D4D4' }} />
                      <span className="hero-app-step" style={{ background: '#D4D4D4' }} />
                      <span className="hero-app-step" style={{ background: '#D4D4D4' }} />
                      <span className="hero-app-step" style={{ background: '#D4D4D4' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Layer 5: Torn paper collage */}
      <div className="hero-papers" aria-hidden="true" ref={papersRef}>
        {/* Piece 0: Large white sheet (backdrop) */}
        <div className="paper-piece paper-0">
          <div className="paper-piece-inner paperSheetMask">
            <div className="paper-piece-color" style={{ background: '#F7F7F7' }} />
          </div>
        </div>
        {/* Piece 1: Lavender blob (left) */}
        <div className="paper-piece paper-1">
          <div className="paper-piece-inner paperShredBlobSquareMask">
            <div className="paper-piece-color" style={{ background: 'rgb(184, 202, 245)' }} />
            <img src="/landing/paper-texture.webp" alt="" className="paper-piece-texture" />
          </div>
        </div>
        {/* Piece 2: Dark UFO shape (right, high) */}
        <div className="paper-piece paper-2">
          <div className="paper-piece-inner paperShredUfoMask">
            <div className="paper-piece-color" style={{ background: '#FFFFFF' }} />
            <img src="/landing/paper-black.png" alt="" className="paper-piece-texture" style={{ mixBlendMode: 'normal', opacity: 1 }} />
          </div>
        </div>
        {/* Piece 3: White+Grey mountain stack */}
        <div className="paper-piece paper-3">
          <div className="paper-3-back paper-piece-inner paperShredFlatBottomBackMask">
            <div className="paper-piece-color" style={{ background: '#FFFFFF' }} />
          </div>
          <div className="paper-3-front paper-piece-inner paperShredFlatBottomFrontMask">
            <div className="paper-piece-color" style={{ background: 'rgb(230, 230, 228)' }} />
            <img src="/landing/paper-texture.webp" alt="" className="paper-piece-texture" />
          </div>
        </div>
        {/* Piece 4: White blob + notebook texture (right, foreground) */}
        <div className="paper-piece paper-4">
          <div className="paper-piece-inner paperShredBlobMask">
            <div className="paper-piece-color" style={{ background: '#FFFFFF' }} />
            <img src="/landing/paper-notebook.webp" alt="" className="paper-piece-texture" style={{ mixBlendMode: 'normal', opacity: 1 }} />
          </div>
        </div>
      </div>
    </section>
  );
}
