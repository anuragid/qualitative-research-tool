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
 * See `docs/production-readiness/prs/pr21-frontend-defensive.md`.
 */

function RouteErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8 text-center"
    >
      <h2 className="text-h3 text-foreground">Something went wrong</h2>
      <p className="max-w-md text-sm text-text-tertiary">
        {(error instanceof Error && error.message) ||
          "An unexpected error occurred while rendering this page."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
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
            category: "route.crash",
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
