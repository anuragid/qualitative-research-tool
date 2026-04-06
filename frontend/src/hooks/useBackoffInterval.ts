import { useRef, useCallback } from "react";

export interface BackoffOptions {
  /** Starting interval in milliseconds. */
  initialMs: number;
  /** Maximum interval in milliseconds. */
  maxMs: number;
  /**
   * Number of polls before the interval doubles. Default 6.
   *
   * Example with `initialMs: 3000, maxMs: 15000, growEvery: 6`:
   *   polls 1-6  -> 3000 ms  (~18s total)
   *   polls 7-12 -> 6000 ms  (~36s total)
   *   polls 13-18 -> 12000 ms (~72s total)
   *   polls 19+  -> 15000 ms (capped)
   */
  growEvery?: number;
}

/**
 * Returns a stable callback that produces exponentially-growing polling
 * intervals, suitable for passing to React Query's `refetchInterval`.
 *
 * Usage pattern inside a React Query hook:
 *
 *   const getInterval = useBackoffInterval({ initialMs: 3000, maxMs: 15000 });
 *   ...
 *   refetchInterval: (query) => {
 *     const data = query.state.data;
 *     const shouldPoll = !!(data && data.status === "processing");
 *     return getInterval(shouldPoll);
 *   }
 *
 * Semantics:
 *   - When `shouldPoll` is `false`, the internal counter resets and `false`
 *     is returned (polling stops). The next time `shouldPoll` flips back to
 *     `true`, the interval starts fresh at `initialMs`.
 *   - When `document.hidden` is `true`, `false` is returned WITHOUT resetting
 *     the counter. React Query will pause polling, and when the tab becomes
 *     visible again the interval resumes at whatever value it had reached.
 *   - Otherwise the counter is incremented and the next interval is
 *     `min(maxMs, initialMs * 2^floor(count/growEvery))`.
 *
 * Each call site gets its own private counter via `useRef`, so multiple
 * mounted consumers of the same hook don't share state.
 */
export function useBackoffInterval(options: BackoffOptions) {
  const { initialMs, maxMs, growEvery = 6 } = options;
  const countRef = useRef(0);

  return useCallback(
    (shouldPoll: boolean): number | false => {
      if (!shouldPoll) {
        countRef.current = 0;
        return false;
      }
      if (typeof document !== "undefined" && document.hidden) {
        // Pause without resetting — polling resumes at the current interval
        // when the tab becomes visible again.
        return false;
      }
      const exponent = Math.floor(countRef.current / growEvery);
      const interval = Math.min(maxMs, initialMs * Math.pow(2, exponent));
      countRef.current += 1;
      return interval;
    },
    [initialMs, maxMs, growEvery],
  );
}
