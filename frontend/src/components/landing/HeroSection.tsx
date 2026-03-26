import { Link } from 'react-router-dom';

interface HeroSectionProps {
  isSignedIn: boolean;
}

export function HeroSection({ isSignedIn }: HeroSectionProps) {
  return (
    <section className="hero" id="hero">
      {/* Layer 1: Sky gradient */}
      <div className="hero-sky" aria-hidden="true" />

      {/* Layer 2: White wash at bottom */}
      <div className="hero-wash" aria-hidden="true" />

      {/* Layer 3: Paper texture overlay */}
      <div className="hero-texture" aria-hidden="true">
        <img src="/landing/paper-texture.png" alt="" loading="eager" />
      </div>

      {/* Layer 4: Edge clouds */}
      <img src="/landing/cloud.png" alt="" className="hero-cloud hero-cloud-1" loading="eager" aria-hidden="true" />
      <img src="/landing/cloud.png" alt="" className="hero-cloud hero-cloud-2" loading="eager" aria-hidden="true" />

      {/* Content */}
      <div className="hero-content">
        <h1>Your research toolkit, <em>digitized</em></h1>
        <p className="hero-subtitle">
          Transform qualitative research data into structured insights using proven analytical frameworks.
        </p>
        <div className="hero-cta-group">
          <Link to={isSignedIn ? '/projects' : '/sign-up'} className="glass-btn">
            <span>Get Started Free</span>
          </Link>
        </div>
      </div>

      {/* Product screenshot mockup */}
      <div className="hero-product">
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
                <p className="hero-app-main-subtitle">3 videos &middot; 1 analyzed, 1 in progress</p>
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
                      <span className="hero-app-step" style={{ background: '#C0392B' }} title="Evaluate" />
                      <span className="hero-app-step" style={{ background: '#7B6CB7' }} title="Synthesize" />
                    </div>
                  </div>
                </div>
                {/* Card 2: In progress */}
                <div className="hero-app-card">
                  <div className="hero-app-card-thumb" />
                  <div className="hero-app-card-body">
                    <div className="hero-app-card-title">Interview &mdash; James K.</div>
                    <div className="hero-app-card-status">
                      <span className="hero-app-status-dot" style={{ background: '#F59E0B' }} />
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
      <div className="hero-papers" aria-hidden="true">
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
