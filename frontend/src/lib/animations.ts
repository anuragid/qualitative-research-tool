import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
// Register plugins
gsap.registerPlugin(useGSAP, ScrollTrigger);

// Re-export for convenience
export { gsap, useGSAP, ScrollTrigger };

// Default easing presets
export const ease = {
  smooth: 'power2.out',
  smoothInOut: 'power2.inOut',
  snappy: 'power3.out',
  bounce: 'back.out(1.4)',
  gentle: 'power1.out',
} as const;

// Duration presets (in seconds)
export const duration = {
  fast: 0.15,
  normal: 0.3,
  slow: 0.6,
  page: 0.5,
} as const;

// Reusable animation configs
export const animations = {
  fadeInUp: {
    y: 30,
    opacity: 0,
    duration: duration.slow,
    ease: ease.smooth,
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
    ease: ease.smooth,
  },
  stagger: {
    each: 0.08,
    ease: ease.gentle,
  },
} as const;

// Counter animation helper
export function animateCounter(
  setter: (value: number) => void,
  target: number,
  durationSec = 2,
  easeFn: string = ease.smooth
) {
  const counter = { value: 0 };
  return gsap.to(counter, {
    value: target,
    duration: durationSec,
    ease: easeFn,
    onUpdate: () => setter(Math.round(counter.value)),
  });
}
