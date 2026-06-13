import { useEffect } from "react";
import type { ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import type { FallbackProps } from "react-error-boundary";
import * as Sentry from "@sentry/react";
import { RefreshCw } from "lucide-react";
import { Button } from "./ui/button";

/**
 * Per-route error boundary — a narrower sibling of the top-level
 * ErrorBoundary in `main.tsx`. Wrapping each route in this component
 * means a render crash in one page doesn't black out the entire app,
 * and the user gets a visible recovery affordance instead of the
 * generic overlay.
 *
 * Also handles ChunkLoadError (stale hash after a deploy) by prompting
 * a hard reload rather than showing a cryptic "Failed to fetch
 * dynamically imported module" message. A sessionStorage attempt
 * counter guards against reload loops: if a reload was already
 * attempted and the chunk still fails (e.g. genuine network outage,
 * not a stale deploy), we fall through to the generic error UI
 * instead of offering another reload.
 *
 * See `docs/production-readiness/prs/pr21-frontend-defensive.md`.
 */

const CHUNK_RELOAD_ATTEMPTS_KEY = "route-chunk-reload-attempts";

function getChunkReloadAttempts(): number {
  try {
    return Number(sessionStorage.getItem(CHUNK_RELOAD_ATTEMPTS_KEY)) || 0;
  } catch {
    // sessionStorage unavailable (private mode / disabled) — treat as
    // "already attempted" so we never risk a reload loop we can't track.
    return 1;
  }
}

function markChunkReloadAttempt(): void {
  try {
    sessionStorage.setItem(
      CHUNK_RELOAD_ATTEMPTS_KEY,
      String(getChunkReloadAttempts() + 1)
    );
  } catch {
    // Ignore — getChunkReloadAttempts already fails safe.
  }
}

function clearChunkReloadAttempts(): void {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_ATTEMPTS_KEY);
  } catch {
    // Ignore.
  }
}

/**
 * Clears the chunk-reload attempt counter. Render this INSIDE the
 * route's `<Suspense>` boundary, next to the lazy page: children of a
 * Suspense boundary commit together only after every lazy import has
 * resolved, so this effect firing is proof the route rendered
 * successfully — at which point the counter must reset so a future
 * deploy's ChunkLoadError gets a fresh reload offer.
 *
 * (Placing it outside Suspense would clear the counter while the chunk
 * is still in flight, defeating the loop guard.)
 */
export function ChunkLoadRecoveryReset() {
  useEffect(() => {
    clearChunkReloadAttempts();
  }, []);
  return null;
}

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Vite/Rollup dynamic import failures surface as one of these patterns
  return (
    error.name === "ChunkLoadError" ||
    /Loading chunk \d+ failed/i.test(error.message) ||
    /Failed to fetch dynamically imported module/i.test(error.message) ||
    /Unable to preload CSS/i.test(error.message)
  );
}

function RouteErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const isChunk = isChunkLoadError(error);
  // Offer the reload shortcut only on the FIRST chunk failure this
  // session. If we already reloaded once and the chunk still won't
  // load, another reload won't fix it — fall through to generic UI.
  const offerReload = isChunk && getChunkReloadAttempts() < 1;

  useEffect(() => {
    // A different (non-chunk) error means any previous chunk-reload
    // attempt is no longer relevant — reset the counter.
    if (!isChunk) {
      clearChunkReloadAttempts();
    }
  }, [isChunk]);

  const handleReloadToUpdate = () => {
    markChunkReloadAttempt();
    window.location.reload();
  };

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8 text-center"
    >
      <h2 className="text-h3 text-foreground">
        {offerReload ? "Update available" : "Something went wrong"}
      </h2>
      <p className="max-w-md text-sm text-text-tertiary">
        {offerReload
          ? "A new version of the app was deployed. Reload the page to get the latest version."
          : isChunk
            ? "Part of the app failed to load, even after refreshing. Please check your connection and try again."
            : (error instanceof Error && error.message) ||
              "An unexpected error occurred while rendering this page."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {offerReload ? (
          <Button
            onClick={handleReloadToUpdate}
            className="rounded-full gap-1.5"
          >
            <RefreshCw className="h-4 w-4" />
            Reload to update
          </Button>
        ) : (
          <>
            <Button onClick={resetErrorBoundary} className="rounded-full gap-1.5">
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="rounded-full"
            >
              Reload page
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

interface RouteErrorBoundaryProps {
  children: ReactNode;
  /**
   * Optional identifier that's attached to the Sentry event as a tag
   * — useful for filtering the "route.crash" events by page.
   */
  routeName?: string;
}

export function RouteErrorBoundary({
  children,
  routeName,
}: RouteErrorBoundaryProps) {
  return (
    <ErrorBoundary
      FallbackComponent={RouteErrorFallback}
      onError={(error, info) => {
        Sentry.captureException(error, {
          tags: {
            category: isChunkLoadError(error) ? "chunk.load.error" : "route.crash",
            ...(routeName ? { route: routeName } : {}),
          },
          contexts: {
            react: { componentStack: info.componentStack ?? undefined },
          },
        });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
