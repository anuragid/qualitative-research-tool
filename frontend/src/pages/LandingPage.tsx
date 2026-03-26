import { useRef, useCallback, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/animations';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAuth } from '../hooks/useAuth';
import './landing-page.css';
import { LandingNav } from '../components/landing/LandingNav';
import { HeroSection } from '../components/landing/HeroSection';
import { ContactForm } from '../components/landing/ContactForm';
import { LandingFooter } from '../components/landing/LandingFooter';

gsap.registerPlugin(ScrollTrigger);

/* ── Node Editor Mockup ────────────────────────────────────────────────
   Dynamically calculates SVG edge paths from actual rendered node
   positions so connections always go port-to-port, never over nodes.
   ──────────────────────────────────────────────────────────────────── */

type Edge = { from: string; fromSide: 'right' | 'bottom'; to: string; toSide: 'left' | 'top' };

const EDGES: Edge[] = [
  { from: 'input',  fromSide: 'right',  to: 'chunk',  toSide: 'left' },   // Transcript → Chunk
  { from: 'chunk',  fromSide: 'bottom', to: 'infer',  toSide: 'top' },    // Chunk ↓ Infer
  { from: 'chunk',  fromSide: 'right',  to: 'relate', toSide: 'left' },   // Chunk → Relate (through empty cell)
  { from: 'infer',  fromSide: 'right',  to: 'synth',  toSide: 'left' },   // Infer → Synth (through gap)
  { from: 'relate', fromSide: 'bottom', to: 'synth',  toSide: 'top' },    // Relate ↓ Synth
];

function getPort(el: HTMLElement, box: DOMRect, side: 'left' | 'right' | 'top' | 'bottom') {
  const r = el.getBoundingClientRect();
  const x = r.left - box.left;
  const y = r.top - box.top;
  switch (side) {
    case 'right':  return { x: x + r.width, y: y + r.height / 2 };
    case 'left':   return { x, y: y + r.height / 2 };
    case 'bottom': return { x: x + r.width / 2, y: y + r.height };
    case 'top':    return { x: x + r.width / 2, y };
  }
}

function buildPath(from: { x: number; y: number }, fromSide: string, to: { x: number; y: number }, toSide: string) {
  // Vertical → Vertical: straight line through row gap
  if ((fromSide === 'bottom' && toSide === 'top') || (fromSide === 'top' && toSide === 'bottom')) {
    return `M${from.x},${from.y} L${to.x},${to.y}`;
  }

  const dx = Math.abs(to.x - from.x);
  // Tension stays within the gap — never push control points into adjacent nodes
  const t = Math.max(Math.min(dx * 0.55, 28), 12);

  const cp1x = fromSide === 'right' ? from.x + t : fromSide === 'left' ? from.x - t : from.x;
  const cp1y = fromSide === 'bottom' ? from.y + t : fromSide === 'top' ? from.y - t : from.y;
  const cp2x = toSide === 'left' ? to.x - t : toSide === 'right' ? to.x + t : to.x;
  const cp2y = toSide === 'top' ? to.y - t : toSide === 'bottom' ? to.y + t : to.y;
  return `M${from.x},${from.y} C${cp1x},${cp1y} ${cp2x},${cp2y} ${to.x},${to.y}`;
}

function NodeEditorMockup() {
  const editorRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);

  useEffect(() => {
    function calc() {
      const el = editorRef.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const result: string[] = [];
      for (const edge of EDGES) {
        const fromEl = el.querySelector<HTMLElement>(`[data-node="${edge.from}"]`);
        const toEl = el.querySelector<HTMLElement>(`[data-node="${edge.to}"]`);
        if (!fromEl || !toEl) continue;
        const fromPort = getPort(fromEl, box, edge.fromSide);
        const toPort = getPort(toEl, box, edge.toSide);
        result.push(buildPath(fromPort, edge.fromSide, toPort, edge.toSide));
      }
      setPaths(result);
    }
    calc();
    window.addEventListener('resize', calc);
    // Recalc after fonts/layout settle
    const t = setTimeout(calc, 200);
    return () => { window.removeEventListener('resize', calc); clearTimeout(t); };
  }, []);

  return (
    <div className="feature-mockup-card reveal">
      <div className="node-editor" ref={editorRef}>
        {/* SVG edges — dynamically positioned */}
        <svg className="node-edges" aria-hidden="true">
          {paths.map((d, i) => <path key={i} d={d} />)}
        </svg>

        <div className="node-card node-input" data-node="input" style={{ gridArea: 'input' }}>
          <div className="node-port node-port-out" />
          <span className="node-label">Transcript</span>
          <p className="node-desc">Raw interview data</p>
        </div>

        <div className="node-card" data-node="chunk" style={{ gridArea: 'chunk' }}>
          <div className="node-port node-port-in" />
          <div className="node-port node-port-out" />
          <span className="node-status-dot node-status-dot-done" />
          <span className="node-label">Chunk Agent</span>
          <p className="node-desc">Segment into units</p>
        </div>

        <div className="node-card" data-node="infer" style={{ gridArea: 'infer' }}>
          <div className="node-port node-port-in" />
          <div className="node-port node-port-out" />
          <span className="node-status-dot node-status-dot-done" />
          <span className="node-label">Infer Agent</span>
          <p className="node-desc">Derive meaning</p>
        </div>

        <div className="node-card" data-node="relate" style={{ gridArea: 'relate' }}>
          <div className="node-port node-port-in" />
          <div className="node-port node-port-out" />
          <span className="node-status-dot node-status-dot-running" />
          <span className="node-label">Relate Agent</span>
          <p className="node-desc">Find patterns</p>
        </div>

        <div className="node-card" data-node="synth" style={{ gridArea: 'synth' }}>
          <div className="node-port node-port-in" />
          <span className="node-status-dot node-status-dot-queued" />
          <span className="node-label">Synthesize</span>
          <p className="node-desc">Insights &amp; principles</p>
        </div>

        <div className="node-card node-ghost" data-node="custom" style={{ gridArea: 'custom' }}>
          <span className="node-label">+ Your method</span>
        </div>

        <div className="node-canvas-dots" aria-hidden="true" />
      </div>
    </div>
  );
}

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isSignedIn } = useAuth();

  const scrollToSection = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (target) {
      const navHeight = 80;
      const targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight;
      window.scrollTo({
        top: targetPosition,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    }
  }, []);

  // GSAP scroll reveal animations for .reveal elements
  // Initial hidden state is set via CSS (.landing-page .reveal-init) so content
  // remains visible if GSAP/ScrollTrigger fails (e.g. iOS Safari momentum scroll).
  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        gsap.set('.reveal, .reveal-stagger', { opacity: 1, y: 0 });
        gsap.set('.reveal-stagger > *', { opacity: 1, y: 0 });
        return;
      }

      const revealElements = gsap.utils.toArray<HTMLElement>('.reveal, .reveal-stagger');

      // Mark elements as GSAP-managed and set initial state
      revealElements.forEach((el) => {
        el.classList.add('reveal-init');
      });

      revealElements.forEach((el) => {
        gsap.to(el, {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            once: true,
          },
        });
      });

      // iOS Safari fix: refresh ScrollTrigger after layout settles
      ScrollTrigger.refresh();
    },
    { scope: containerRef },
  );

  return (
    <div ref={containerRef} className="landing-page">
      <LandingNav isSignedIn={isSignedIn} scrollToSection={scrollToSection} />

      <HeroSection isSignedIn={isSignedIn} />

      {/* Breathing Space */}
      <div className="breathing">
        <p className="breathing-tagline reveal">Proven methods meet modern intelligence.</p>
      </div>

      {/* The Collection - 5D Analysis Featured Card */}
      <section className="collection" id="collection">
        <div className="collection-inner">
          <p className="section-label reveal">The Collection</p>
          <h2 className="collection-heading reveal">
            Analytical frameworks,
            <br />
            <em>ready to use</em>
          </h2>

          <div className="featured-card reveal">
            <div className="featured-card-content">
              <div className="featured-card-badge">
                <svg viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="7" cy="7" r="2" fill="currentColor" />
                </svg>
                Featured Method
              </div>
              <h3>5D Analysis</h3>
              <p>
                Analyze research videos through five progressive steps that build layered
                understanding. Each step transforms raw data into actionable design insight.
              </p>
              <div className="dimensions reveal-stagger">
                <span className="dimension-badge">
                  <span className="dimension-dot" style={{ background: '#5A8DB8' }} />
                  Chunk
                </span>
                <span className="dimension-badge">
                  <span className="dimension-dot" style={{ background: '#5D9F55' }} />
                  Infer
                </span>
                <span className="dimension-badge">
                  <span className="dimension-dot" style={{ background: '#C8A848' }} />
                  Relate
                </span>
                <span className="dimension-badge">
                  <span className="dimension-dot" style={{ background: '#A11735' }} />
                  Explain
                </span>
                <span className="dimension-badge">
                  <span className="dimension-dot" style={{ background: '#8B6BAE' }} />
                  Activate
                </span>
              </div>
            </div>
            <div className="featured-mockup">
              <div className="mockup-header">
                <div className="mockup-dots">
                  <span className="mockup-dot" />
                  <span className="mockup-dot" />
                  <span className="mockup-dot" />
                </div>
                <span className="mockup-title">5D Analysis Results</span>
              </div>
              {/* Chunk */}
              <div className="mockup-dimension-row">
                <div
                  className="mockup-dim-icon"
                  style={{ background: 'rgba(90,141,184,0.12)', color: '#5A8DB8' }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <rect x="2" y="3" width="4" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
                    <rect x="8" y="3" width="4" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
                    <rect x="5" y="8" width="4" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                </div>
                <span className="mockup-dim-name">Chunk</span>
                <div className="mockup-dim-bar">
                  <div className="mockup-dim-fill" style={{ width: '85%', background: '#5A8DB8' }} />
                </div>
              </div>
              {/* Infer */}
              <div className="mockup-dimension-row">
                <div
                  className="mockup-dim-icon"
                  style={{ background: 'rgba(93,159,85,0.12)', color: '#5D9F55' }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="mockup-dim-name">Infer</span>
                <div className="mockup-dim-bar">
                  <div className="mockup-dim-fill" style={{ width: '72%', background: '#5D9F55' }} />
                </div>
              </div>
              {/* Relate */}
              <div className="mockup-dimension-row">
                <div
                  className="mockup-dim-icon"
                  style={{ background: 'rgba(200,168,72,0.12)', color: '#C8A848' }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="4" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" />
                    <circle cx="10" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M6 7h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="mockup-dim-name">Relate</span>
                <div className="mockup-dim-bar">
                  <div className="mockup-dim-fill" style={{ width: '58%', background: '#C8A848' }} />
                </div>
              </div>
              {/* Explain */}
              <div className="mockup-dimension-row">
                <div
                  className="mockup-dim-icon"
                  style={{ background: 'rgba(161,23,53,0.10)', color: '#A11735' }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 11l4-8 4 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4.5 8h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="mockup-dim-name">Explain</span>
                <div className="mockup-dim-bar">
                  <div className="mockup-dim-fill" style={{ width: '68%', background: '#A11735' }} />
                </div>
              </div>
              {/* Activate */}
              <div className="mockup-dimension-row">
                <div
                  className="mockup-dim-icon"
                  style={{ background: 'rgba(139,107,174,0.12)', color: '#8B6BAE' }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 2l1.5 3H12l-2.5 2 1 3L7 8.5 3.5 10l1-3L2 5h3.5L7 2z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="mockup-dim-name">Activate</span>
                <div className="mockup-dim-bar">
                  <div className="mockup-dim-fill" style={{ width: '45%', background: '#8B6BAE' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Breathing Space */}
      <div className="breathing">
        <p className="breathing-tagline reveal">From raw footage to structured understanding.</p>
      </div>

      {/* Feature 1: Upload & Transcribe (Purple) */}
      <section className="feature-section feature-purple" id="features">
        <div className="feature-texture" aria-hidden="true">
          <img src="/landing/paper-texture.png" alt="" loading="lazy" />
        </div>
        <div className="feature-inner">
          <div className="feature-text reveal">
            <p className="feature-label">Upload &amp; Transcribe</p>
            <h2 className="feature-heading">
              Start with <em>video</em>,
              <br />
              end with insight
            </h2>
            <p className="feature-body">
              Upload research recordings and receive accurate, timestamped transcriptions powered by
              AssemblyAI. Support for interviews, observations, and field studies.
            </p>
            <Link
              to={isSignedIn ? '/projects' : '/sign-up'}
              className="glass-btn glass-btn-white"
              style={{ alignSelf: 'flex-start' }}
            >
              <span>Try it free</span>
            </Link>
          </div>
          <div className="feature-mockup-card reveal">
            <div className="upload-mockup">
              <div className="upload-dropzone">
                <div className="upload-icon">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 14V3M6 7l4-4 4 4" />
                    <path d="M17 14v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2" />
                  </svg>
                </div>
                <p className="upload-label">
                  <strong>Click to upload</strong> or drag and drop
                </p>
                <p className="upload-label" style={{ fontSize: 12, color: 'var(--color-ink-35)' }}>
                  MP4, MOV, WebM up to 2GB
                </p>
              </div>
              <div className="upload-file-row">
                <div className="upload-file-icon">MP4</div>
                <div className="upload-file-info">
                  <p className="upload-file-name">kitchen-observation-03.mp4</p>
                  <p className="upload-file-meta">1.2 GB &middot; Transcribing...</p>
                  <div className="upload-progress">
                    <div className="upload-progress-fill" />
                  </div>
                </div>
              </div>
              <div className="upload-file-row">
                <div className="upload-file-icon" style={{ background: 'var(--color-green)' }}>
                  MOV
                </div>
                <div className="upload-file-info">
                  <p className="upload-file-name">user-interview-sarah.mov</p>
                  <p className="upload-file-meta">842 MB &middot; Complete</p>
                </div>
                <div className="upload-check">
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 6l2.5 2.5 4.5-5" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Breathing Space */}
      <div className="breathing">
        <p className="breathing-tagline reveal">Five steps. One complete picture.</p>
      </div>

      {/* Feature 2: AI-Powered Analysis (Green) */}
      <section className="feature-section feature-green">
        <div className="feature-texture" aria-hidden="true">
          <img src="/landing/paper-texture.png" alt="" loading="lazy" />
        </div>
        <div className="feature-inner reversed">
          <div className="feature-text reveal">
            <p className="feature-label">AI-Powered Analysis</p>
            <h2 className="feature-heading">
              A structured <em>pipeline</em>,
              <br />
              not a black box
            </h2>
            <p className="feature-body">
              Each video passes through five progressive steps in sequence, building layered
              understanding. Then cross-video synthesis reveals patterns across your entire corpus.
            </p>
            <Link
              to={isSignedIn ? '/projects' : '/sign-up'}
              className="glass-btn glass-btn-white"
              style={{ alignSelf: 'flex-start' }}
            >
              <span>See how it works</span>
            </Link>
          </div>
          <NodeEditorMockup />
        </div>
      </section>

      {/* Breathing Space */}
      <div className="breathing">
        <p className="breathing-tagline reveal">Patterns emerge across the whole corpus.</p>
      </div>

      {/* Feature 3: Cross-Video Insights (Gold) */}
      <section className="feature-section feature-gold">
        <div className="feature-texture" aria-hidden="true">
          <img src="/landing/paper-texture.png" alt="" loading="lazy" />
        </div>
        <div className="feature-inner">
          <div className="feature-text reveal">
            <p className="feature-label">Cross-Video Insights</p>
            <h2 className="feature-heading">
              See the <em>bigger</em>
              <br />
              picture
            </h2>
            <p className="feature-body">
              Once individual videos are analyzed, cross-video synthesis identifies recurring themes,
              contradictions, and emergent patterns across your entire research set.
            </p>
            <Link
              to={isSignedIn ? '/projects' : '/sign-up'}
              className="glass-btn glass-btn-white"
              style={{ alignSelf: 'flex-start' }}
            >
              <span>Explore insights</span>
            </Link>
          </div>
          <div className="feature-mockup-card reveal">
            <div className="insights-mockup">
              {/* Theme card */}
              <div className="insight-card">
                <div className="insight-card-header">
                  <div
                    className="insight-card-icon"
                    style={{ background: 'rgba(139,92,246,0.1)', color: '#8B5CF6' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <span className="insight-card-label" style={{ color: '#8B5CF6' }}>Theme</span>
                </div>
                <p className="insight-card-text">
                  Participants consistently improvise workarounds when standard tools fail, revealing
                  latent needs unaddressed by current solutions.
                </p>
                <div className="insight-card-tags">
                  <span className="insight-tag">3 videos</span>
                  <span className="insight-tag">Chunk</span>
                  <span className="insight-tag">Infer</span>
                </div>
              </div>
              {/* Contradiction card */}
              <div className="insight-card">
                <div className="insight-card-header">
                  <div
                    className="insight-card-icon"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 10L10 2M2 2l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <span className="insight-card-label" style={{ color: '#EF4444' }}>
                    Contradiction
                  </span>
                </div>
                <p className="insight-card-text">
                  Stated preference for efficiency conflicts with observed behavior favoring familiar,
                  slower workflows over unfamiliar faster ones.
                </p>
                <div className="insight-card-tags">
                  <span className="insight-tag">2 videos</span>
                  <span className="insight-tag">Explain</span>
                  <span className="insight-tag">Relate</span>
                </div>
              </div>
              {/* Pattern card */}
              <div className="insight-card">
                <div className="insight-card-header">
                  <div
                    className="insight-card-icon"
                    style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M6 3.5v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <span className="insight-card-label" style={{ color: '#10B981' }}>Pattern</span>
                </div>
                <p className="insight-card-text">
                  Environmental noise levels directly correlate with increased hesitation and error
                  rates across all observed tasks.
                </p>
                <div className="insight-card-tags">
                  <span className="insight-tag">4 videos</span>
                  <span className="insight-tag">Activate</span>
                  <span className="insight-tag">Chunk</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Breathing Space */}
      <div className="breathing">
        <p className="breathing-tagline reveal">More methods on the way.</p>
      </div>

      {/* Upcoming Methods - Folder Tab Cards */}
      <section className="methods-section" id="upcoming">
        <div className="methods-inner">
          <p className="section-label reveal">Coming Soon</p>
          <h2 className="methods-heading reveal">
            Upcoming <em>methods</em>
          </h2>

          <div className="methods-grid reveal-stagger">
            <div className="folder-card" style={{ background: '#D4EDE8' }}>
              <div>
                <h3 className="folder-card-title">AEIOU Framework</h3>
                <p className="folder-card-desc">
                  Activities, Environments, Interactions, Objects, and Users. A structured framework for
                  analyzing ethnographic observation data.
                </p>
              </div>
              <div className="folder-card-footer">
                <span className="folder-card-status">In Development</span>
              </div>
            </div>

            <div className="folder-card" style={{ background: '#D4E0ED' }}>
              <div>
                <h3 className="folder-card-title">Affinity Mapping</h3>
                <p className="folder-card-desc">
                  Group collected observations into meaningful clusters. Surface hidden relationships
                  across your research data.
                </p>
              </div>
              <div className="folder-card-footer">
                <span className="folder-card-status">Planned</span>
              </div>
            </div>

            <div className="folder-card" style={{ background: '#E8D8EE' }}>
              <div>
                <h3 className="folder-card-title">Journey Mapping</h3>
                <p className="folder-card-desc">
                  Trace the complete experience arc. Map touchpoints, emotions, and pain points
                  across time.
                </p>
              </div>
              <div className="folder-card-footer">
                <span className="folder-card-status">Planned</span>
              </div>
            </div>

            <div className="folder-card" style={{ background: '#F2E4CF' }}>
              <div>
                <h3 className="folder-card-title">Thematic Analysis</h3>
                <p className="folder-card-desc">
                  Identify and analyze recurring themes across your recordings. Build codebooks from
                  collected research data systematically.
                </p>
              </div>
              <div className="folder-card-footer">
                <span className="folder-card-status">Planned</span>
              </div>
            </div>

            <div className="folder-card" style={{ background: '#E8DDD4' }}>
              <div>
                <h3 className="folder-card-title">Grounded Theory</h3>
                <p className="folder-card-desc">
                  Theory emerges from the data. Open, axial, and selective coding in a guided
                  workflow.
                </p>
              </div>
              <div className="folder-card-footer">
                <span className="folder-card-status">Exploring</span>
              </div>
            </div>

            <div className="folder-card" style={{ background: '#F0D4D9' }}>
              <div>
                <h3 className="folder-card-title">Persona Synthesis</h3>
                <p className="folder-card-desc">
                  Construct evidence-based personas from observed behaviors, not assumptions or
                  demographics.
                </p>
              </div>
              <div className="folder-card-footer">
                <span className="folder-card-status">Exploring</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="about-section" id="about">
        <div className="about-inner reveal">
          <p className="section-label">About</p>
          <h2 className="about-heading">
            Built to help researchers <em>analyze</em>,
            <br />
            by researchers
          </h2>
          <p className="about-text">
            methodex brings qualitative research methods taught by Jeremy Alexis at the Institute of
            Design, Illinois Institute of Technology, into an AI-powered digital workflow. Upload
            interview videos, and AI applies proven analytical frameworks to surface patterns and
            insights that would take hours to find manually.
          </p>
          <p className="about-text">
            Designed for design researchers and students, methodex pairs the rigor of established
            methods with modern AI to transform raw observations into structured, actionable insight.
          </p>

          <div className="about-orgs">
            <span className="about-org">
              <span className="about-org-dot" style={{ background: 'var(--color-teal)' }} />
              Institute of Design
            </span>
            <span className="about-org">
              <span className="about-org-dot" style={{ background: 'var(--color-purple)' }} />
              Illinois Institute of Technology
            </span>
            <span className="about-org">
              <span className="about-org-dot" style={{ background: 'var(--color-gold)' }} />
              Center for Decision Quality
            </span>
          </div>
        </div>
      </section>

      <ContactForm />

      <LandingFooter scrollToSection={scrollToSection} />
    </div>
  );
}
