import { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Upload, Brain, GitMerge, Lock, Menu, X } from "lucide-react";
import { gsap, useGSAP, ease, duration, prefersReducedMotion } from "../lib/animations";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Frosted-glass header on scroll
  useEffect(() => {
    const handleScroll = () => {
      setHeaderScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // GSAP scroll-reveal animations
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;

      // Hero entrance
      gsap.from("[data-animate='hero']", {
        y: 30,
        opacity: 0,
        duration: duration.slow,
        ease: ease.standard,
        stagger: 0.12,
      });

      // Feature cards staggered entrance on scroll
      gsap.from("[data-animate='feature-card']", {
        scrollTrigger: {
          trigger: "[data-section='features']",
          start: "top 80%",
          once: true,
        },
        y: 40,
        opacity: 0,
        duration: duration.entrance,
        ease: ease.standard,
        stagger: 0.1,
      });

      // How-it-works steps staggered entrance
      gsap.from("[data-animate='step']", {
        scrollTrigger: {
          trigger: "[data-section='how-it-works']",
          start: "top 80%",
          once: true,
        },
        y: 30,
        opacity: 0,
        duration: duration.entrance,
        ease: ease.standard,
        stagger: 0.08,
      });

      // Security section
      gsap.from("[data-animate='security']", {
        scrollTrigger: {
          trigger: "[data-section='security']",
          start: "top 85%",
          once: true,
        },
        y: 20,
        opacity: 0,
        duration: duration.entrance,
        ease: ease.standard,
      });

      // CTA section
      gsap.from("[data-animate='cta']", {
        scrollTrigger: {
          trigger: "[data-section='cta']",
          start: "top 85%",
          once: true,
        },
        y: 20,
        opacity: 0,
        duration: duration.entrance,
        ease: ease.standard,
        stagger: 0.1,
      });
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef} className="min-h-screen bg-surface-page">
      {/* ===== HEADER / NAVIGATION ===== */}
      <header
        ref={headerRef}
        className={`fixed top-0 left-0 right-0 z-[var(--z-sticky)] transition-[background,box-shadow] duration-[var(--duration-slow)] ease-[var(--ease)] ${
          headerScrolled
            ? "frosted-glass shadow-subtle"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto max-w-6xl flex h-16 items-center justify-between px-6">
          {/* Typemark */}
          <Link to="/" className="text-h4 text-foreground no-underline">
            method<span className="italic text-brand-burnt-orange">x</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-ui text-base-55 hover:text-foreground transition-[color] duration-[var(--duration-micro)] ease-[var(--ease)] no-underline"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-ui text-base-55 hover:text-foreground transition-[color] duration-[var(--duration-micro)] ease-[var(--ease)] no-underline"
            >
              How it works
            </a>
            <Link
              to="/sign-in"
              className="text-ui text-base-55 hover:text-foreground transition-[color] duration-[var(--duration-micro)] ease-[var(--ease)] no-underline"
            >
              Sign In
            </Link>
            <Link
              to="/sign-up"
              className="inline-flex items-center justify-center text-ui bg-primary text-primary-foreground rounded-full px-5 py-2 hover:opacity-90 transition-[color,background,box-shadow,opacity] duration-[var(--duration-micro)] ease-[var(--ease)] no-underline"
            >
              Try methodex
            </Link>
          </nav>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex items-center justify-center w-10 h-10 rounded-md hover:bg-base-04 transition-[background] duration-[var(--duration-micro)] ease-[var(--ease)]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5 text-foreground" />
            ) : (
              <Menu className="w-5 h-5 text-foreground" />
            )}
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden frosted-glass border-t border-border px-6 py-4 flex flex-col gap-3">
            <a
              href="#features"
              className="text-ui text-base-55 hover:text-foreground no-underline py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-ui text-base-55 hover:text-foreground no-underline py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              How it works
            </a>
            <Link
              to="/sign-in"
              className="text-ui text-base-55 hover:text-foreground no-underline py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Sign In
            </Link>
            <Link
              to="/sign-up"
              className="inline-flex items-center justify-center text-ui bg-primary text-primary-foreground rounded-full px-5 py-2.5 no-underline mt-1"
              onClick={() => setMobileMenuOpen(false)}
            >
              Try methodex
            </Link>
          </div>
        )}
      </header>

      {/* ===== HERO SECTION ===== */}
      <section className="relative overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32">
        {/* Warm pastel gradient background */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, var(--color-brand-pale-blue) 0%, var(--color-brand-pale-green) 50%, var(--color-brand-pale-gold) 100%)",
          }}
        />
        {/* Noise overlay */}
        <div className="absolute inset-0 noise-texture noise-light">
          <span className="relative z-[2]" />
        </div>

        <div className="relative z-[2] mx-auto max-w-3xl px-6 text-center">
          <h1 data-animate="hero" className="text-h1 text-foreground mb-6">
            Your research, beautifully organized
          </h1>
          <p
            data-animate="hero"
            className="text-lg leading-relaxed text-base-62 mb-10 max-w-2xl mx-auto"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Upload video interviews, let AI extract deep insights, and discover
            cross-cutting patterns across your qualitative research — all in one
            place.
          </p>
          <div data-animate="hero">
            <Link
              to="/sign-up"
              className="inline-flex items-center justify-center frosted-glass text-ui text-foreground rounded-full px-8 py-3 shadow-subtle hover:shadow-card transition-[box-shadow,opacity] duration-[var(--duration-normal)] ease-[var(--ease)] no-underline border border-base-09"
            >
              Start Analyzing
            </Link>
          </div>
        </div>
      </section>

      {/* ===== FEATURES SECTION ===== */}
      <section
        id="features"
        data-section="features"
        className="py-20 sm:py-28"
        style={{ backgroundColor: "var(--color-surface-page)" }}
      >
        <div className="mx-auto max-w-6xl px-6">
          <h2
            className="text-h2 text-foreground text-center mb-4"
            data-animate="feature-card"
          >
            Everything you need
          </h2>
          <p
            className="text-center text-base-55 mb-14 max-w-xl mx-auto"
            data-animate="feature-card"
            style={{ fontFamily: "var(--font-body)", fontSize: "16px", lineHeight: "1.5" }}
          >
            From raw video to actionable design principles, methodex handles the
            entire qualitative analysis pipeline.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1: Upload & Transcribe */}
            <div
              data-animate="feature-card"
              className="relative rounded-2xl p-8 shadow-block noise-texture noise-light"
              style={{ backgroundColor: "var(--color-brand-pale-blue)" }}
            >
              <div className="relative z-[2]">
                <div className="w-12 h-12 rounded-xl bg-surface-card/60 flex items-center justify-center mb-5">
                  <Upload className="w-6 h-6 text-foreground" />
                </div>
                <h3 className="text-h3 text-foreground mb-3">
                  Upload &amp; Transcribe
                </h3>
                <p
                  className="text-base-62"
                  style={{ fontFamily: "var(--font-body)", fontSize: "15px", lineHeight: "1.6" }}
                >
                  Drop in video interviews and get speaker-identified
                  transcripts automatically. Supports all major formats.
                </p>
              </div>
            </div>

            {/* Feature 2: AI Analysis */}
            <div
              data-animate="feature-card"
              className="relative rounded-2xl p-8 shadow-block noise-texture noise-light"
              style={{ backgroundColor: "var(--color-brand-pale-green)" }}
            >
              <div className="relative z-[2]">
                <div className="w-12 h-12 rounded-xl bg-surface-card/60 flex items-center justify-center mb-5">
                  <Brain className="w-6 h-6 text-foreground" />
                </div>
                <h3 className="text-h3 text-foreground mb-3">
                  AI Analysis
                </h3>
                <p
                  className="text-base-62"
                  style={{ fontFamily: "var(--font-body)", fontSize: "15px", lineHeight: "1.6" }}
                >
                  A five-step framework — chunk, infer, relate, explain,
                  activate — extracts meaning and generates design principles
                  from every interview.
                </p>
              </div>
            </div>

            {/* Feature 3: Cross-Video Insights */}
            <div
              data-animate="feature-card"
              className="relative rounded-2xl p-8 shadow-block noise-texture noise-light sm:col-span-2 lg:col-span-1"
              style={{ backgroundColor: "var(--color-brand-pale-gold)" }}
            >
              <div className="relative z-[2]">
                <div className="w-12 h-12 rounded-xl bg-surface-card/60 flex items-center justify-center mb-5">
                  <GitMerge className="w-6 h-6 text-foreground" />
                </div>
                <h3 className="text-h3 text-foreground mb-3">
                  Cross-Video Insights
                </h3>
                <p
                  className="text-base-62"
                  style={{ fontFamily: "var(--font-body)", fontSize: "15px", lineHeight: "1.6" }}
                >
                  Discover meta-patterns, saturation analysis, and system-level
                  insights that emerge across multiple interviews in a project.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS SECTION ===== */}
      <section
        id="how-it-works"
        data-section="how-it-works"
        className="py-20 sm:py-28"
        style={{ backgroundColor: "var(--color-surface-card)" }}
      >
        <div className="mx-auto max-w-4xl px-6">
          <h2
            className="text-h2 text-foreground text-center mb-4"
            data-animate="step"
          >
            How it works
          </h2>
          <p
            className="text-center text-base-55 mb-16 max-w-lg mx-auto"
            data-animate="step"
            style={{ fontFamily: "var(--font-body)", fontSize: "16px", lineHeight: "1.5" }}
          >
            Five steps from raw interview to actionable design principles.
          </p>

          <div className="flex flex-col gap-10">
            {[
              {
                step: 1,
                name: "Chunk",
                desc: "Break each interview transcript into meaningful segments — quotes, facts, context, and observations.",
                color: "var(--color-brand-mustard)",
              },
              {
                step: 2,
                name: "Infer",
                desc: "Extract deeper meaning, assumptions, and mental models from each segment using AI analysis.",
                color: "var(--color-brand-forest)",
              },
              {
                step: 3,
                name: "Relate",
                desc: "Connect individual inferences into coherent themes and patterns within each interview.",
                color: "var(--color-brand-maroon)",
              },
              {
                step: 4,
                name: "Explain",
                desc: "Generate higher-order insights and explanatory models that account for observed patterns.",
                color: "var(--color-brand-crimson)",
              },
              {
                step: 5,
                name: "Activate",
                desc: "Transform insights into concrete, actionable design principles your team can apply.",
                color: "var(--color-brand-burnt-orange)",
              },
            ].map((item) => (
              <div
                key={item.step}
                data-animate="step"
                className="flex items-start gap-5"
              >
                <div
                  className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-base"
                  style={{ backgroundColor: item.color, fontFamily: "var(--font-body)" }}
                >
                  {item.step}
                </div>
                <div className="pt-1">
                  <h4 className="text-h4 text-foreground mb-1">{item.name}</h4>
                  <p
                    className="text-base-62"
                    style={{ fontFamily: "var(--font-body)", fontSize: "15px", lineHeight: "1.6" }}
                  >
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SECURITY / TRUST SECTION ===== */}
      <section
        data-section="security"
        className="py-16 sm:py-20"
        style={{ backgroundColor: "var(--color-surface-page)" }}
      >
        <div className="mx-auto max-w-3xl px-6">
          <div
            data-animate="security"
            className="flex flex-col sm:flex-row items-start gap-5"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-base-04 flex items-center justify-center">
              <Lock className="w-5 h-5 text-base-55" />
            </div>
            <div>
              <h3 className="text-h4 text-foreground mb-2">
                Your data stays private
              </h3>
              <p
                className="text-base-55"
                style={{ fontFamily: "var(--font-body)", fontSize: "15px", lineHeight: "1.6" }}
              >
                All research videos, transcripts, and analyses are private to
                your account. We use secure cloud storage, encrypted API keys,
                and never share your data with third parties.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTA SECTION ===== */}
      <section
        data-section="cta"
        className="relative overflow-hidden py-20 sm:py-28"
      >
        {/* Different gradient from hero */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, var(--color-brand-lavender) 0%, var(--color-brand-pale-gold) 50%, var(--color-brand-peach) 100%)",
          }}
        />
        <div className="absolute inset-0 noise-texture noise-light">
          <span className="relative z-[2]" />
        </div>

        <div className="relative z-[2] mx-auto max-w-2xl px-6 text-center">
          <h2 data-animate="cta" className="text-h2 text-foreground mb-4">
            Ready to dive into your research?
          </h2>
          <p
            data-animate="cta"
            className="text-base-62 mb-10"
            style={{ fontFamily: "var(--font-body)", fontSize: "16px", lineHeight: "1.5" }}
          >
            Create a free account and start analyzing your qualitative data in
            minutes.
          </p>
          <div
            data-animate="cta"
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              to="/sign-up"
              className="inline-flex items-center justify-center text-ui bg-primary text-primary-foreground rounded-full px-8 py-3 hover:opacity-90 transition-[color,background,box-shadow,opacity] duration-[var(--duration-micro)] ease-[var(--ease)] no-underline"
            >
              Get Started Free
            </Link>
            <Link
              to="/sign-in"
              className="inline-flex items-center justify-center text-ui text-foreground rounded-full px-8 py-3 border border-base-09 bg-surface-card/50 hover:bg-surface-card/80 transition-[color,background,box-shadow,opacity] duration-[var(--duration-micro)] ease-[var(--ease)] no-underline"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer
        className="rounded-t-3xl py-14"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            {/* Typemark */}
            <span
              className="text-h4 text-primary-foreground no-underline"
              style={{ opacity: 1 }}
            >
              method<span className="italic" style={{ color: "var(--color-brand-burnt-orange)" }}>x</span>
            </span>

            {/* Links */}
            <div className="flex items-center gap-6">
              <Link
                to="/sign-in"
                className="text-ui text-primary-foreground/70 no-underline transition-[opacity] duration-[var(--duration-micro)] ease-[var(--ease)] hover:opacity-100"
              >
                Sign In
              </Link>
              <Link
                to="/sign-up"
                className="text-ui text-primary-foreground/70 no-underline transition-[opacity] duration-[var(--duration-micro)] ease-[var(--ease)] hover:opacity-100"
              >
                Sign Up
              </Link>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-primary-foreground/10">
            <p
              className="text-sm text-primary-foreground/50"
              style={{ fontFamily: "var(--font-body)" }}
            >
              &copy; {new Date().getFullYear()} methodex. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
