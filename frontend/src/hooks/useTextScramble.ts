import { useCallback, useEffect, useRef, useState } from 'react';

interface UseTextScrambleOptions {
  duration?: number;
  charSet?: string;
}

interface UseTextScrambleReturn {
  ref: React.RefObject<HTMLElement | null>;
  replay: () => void;
  isScrambling: boolean;
}

const DEFAULT_CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';

const PRESERVED_CHARS = new Set([' ', '.', ',', '\u00A9']);

function randomChar(charSet: string): string {
  return charSet[Math.floor(Math.random() * charSet.length)];
}

export function useTextScramble(
  text: string,
  options?: UseTextScrambleOptions,
): UseTextScrambleReturn {
  const { duration = 1, charSet = DEFAULT_CHARSET } = options ?? {};

  const ref = useRef<HTMLElement | null>(null);
  const [isScrambling, setIsScrambling] = useState(false);
  const rafRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const cancel = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const replay = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    // Respect prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = text;
      return;
    }

    cancel();
    setIsScrambling(true);

    const chars = Array.from(text);
    const len = chars.length;
    const durationMs = duration * 1000;

    // Each character gets a random start delay within the first 40% of total duration,
    // and resolves over ~60% of the total duration from its start time.
    const resolveWindow = durationMs * 0.6;
    const delayWindow = durationMs * 0.4;

    // Pre-compute per-character random start delays
    const startDelays = chars.map(() => Math.random() * delayWindow);

    const startTime = performance.now();

    const step = (now: number) => {
      if (!isMountedRef.current) return;

      const elapsed = now - startTime;
      const output: string[] = new Array(len);

      let allResolved = true;

      for (let i = 0; i < len; i++) {
        const char = chars[i];

        if (PRESERVED_CHARS.has(char)) {
          output[i] = char;
          continue;
        }

        const charElapsed = elapsed - startDelays[i];
        const progress = Math.min(Math.max(charElapsed / resolveWindow, 0), 1);

        if (progress >= 1) {
          output[i] = char;
        } else {
          allResolved = false;
          output[i] = randomChar(charSet);
        }
      }

      if (el) {
        el.textContent = output.join('');
      }

      if (allResolved) {
        rafRef.current = null;
        if (isMountedRef.current) {
          setIsScrambling(false);
        }
        return;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }, [text, duration, charSet, cancel]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancel();
    };
  }, [cancel]);

  return { ref, replay, isScrambling };
}
