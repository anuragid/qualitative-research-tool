import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";

// Register GSAP plugins
gsap.registerPlugin(useGSAP);

// Re-export for convenience
export { gsap, useGSAP };

// Design system easing presets (match CSS cubic-bezier(0.4, 0, 0.2, 1))
export const ease = {
  standard: "power2.out", // closest GSAP match to our CSS ease
  gentle: "power1.out",   // for stagger ease
  enter: "power2.out",    // entrance animations
} as const;

// Duration presets matching design tokens
export const duration = {
  micro: 0.15,   // matches --duration-micro
  normal: 0.2,   // matches --duration-normal
  slow: 0.5,     // matches --duration-slow
  entrance: 0.4, // card/page entrance animations
} as const;

// Reusable animation presets
export const animations = {
  fadeInUp: {
    y: 20,
    opacity: 0,
    duration: duration.entrance,
    ease: ease.standard,
  },
  fadeIn: {
    opacity: 0,
    duration: duration.normal,
    ease: ease.gentle,
  },
  scaleIn: {
    scale: 0.95,
    opacity: 0,
    duration: duration.normal,
    ease: ease.standard,
  },
  stagger: {
    each: 0.08,
    ease: ease.gentle,
  },
} as const;

// Check for reduced motion preference
export const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};
