import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SignIn, SignUp } from "@clerk/react";
import { Toaster } from "sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { UploadProvider } from "./contexts/UploadContext";
import { useAuth } from "./hooks/useAuth";
import { useUserSync } from "./hooks/useUserSync";

// Route-level code splitting — each page is a separate async chunk.
// LandingPage is the priority split: it pulls in ~40 KB of TSX + ~63 KB
// landing-page.css that authenticated users never need.
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetailPage"));
const VideoDetailPage = lazy(() => import("./pages/VideoDetailPage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

/** Reusable spinner — matches the auth-loading indicator in App so the
 *  visual language is consistent across all loading states. */
function PageLoader() {
  return (
    <div
      className="flex items-center justify-center min-h-screen"
      role="status"
      aria-label="Loading page"
    >
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function SignInPage() {
  return (
    <div className="min-h-screen bg-surface-page flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <SignIn routing="hash" signUpUrl="/sign-up" />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="min-h-screen bg-surface-page flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <SignUp routing="hash" signInUrl="/sign-in" />
      </div>
    </div>
  );
}

function App() {
  const { isSignedIn: isAuthenticated, isLoaded } = useAuth();

  // Sync user with backend when authenticated
  useUserSync();

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen" role="status" aria-label="Loading application">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <BrowserRouter>
      <Toaster position="bottom-right" richColors />
      <Routes>
        {/* Public routes */}
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Navigate to="/projects" replace />
            ) : (
              // RouteErrorBoundary wraps Suspense so a ChunkLoadError (stale
              // hash after deploy) is caught and shown as "Update available"
              // rather than a white screen or unhandled rejection.
              <RouteErrorBoundary routeName="landing">
                <Suspense fallback={<PageLoader />}>
                  <LandingPage />
                </Suspense>
              </RouteErrorBoundary>
            )
          }
        />

        <Route
          path="/sign-in"
          element={
            isAuthenticated ? (
              <Navigate to="/projects" replace />
            ) : (
              <SignInPage />
            )
          }
        />

        <Route
          path="/sign-up"
          element={
            isAuthenticated ? (
              <Navigate to="/projects" replace />
            ) : (
              <SignUpPage />
            )
          }
        />

        {/* Protected routes — each wrapped in RouteErrorBoundary so a
            render crash on one page doesn't black out the whole app.
            Suspense sits inside the error boundary: a ChunkLoadError
            thrown during lazy import is caught by the boundary and shown
            as the "Update available / Reload to update" fallback.
            See docs/production-readiness/prs/pr21-frontend-defensive.md. */}
        <Route
          path="/projects"
          element={
            isAuthenticated ? (
              <RouteErrorBoundary routeName="projects">
                <Suspense fallback={<PageLoader />}>
                  <UploadProvider>
                    <ProjectsPage />
                  </UploadProvider>
                </Suspense>
              </RouteErrorBoundary>
            ) : (
              <Navigate to="/sign-in" replace />
            )
          }
        />

        <Route
          path="/projects/:projectId"
          element={
            isAuthenticated ? (
              <RouteErrorBoundary routeName="project-detail">
                <Suspense fallback={<PageLoader />}>
                  <UploadProvider>
                    <ProjectDetailPage />
                  </UploadProvider>
                </Suspense>
              </RouteErrorBoundary>
            ) : (
              <Navigate to="/sign-in" replace />
            )
          }
        />

        <Route
          path="/videos/:videoId"
          element={
            isAuthenticated ? (
              <RouteErrorBoundary routeName="video-detail">
                <Suspense fallback={<PageLoader />}>
                  <UploadProvider>
                    <VideoDetailPage />
                  </UploadProvider>
                </Suspense>
              </RouteErrorBoundary>
            ) : (
              <Navigate to="/sign-in" replace />
            )
          }
        />

        {/* Catch-all 404 route */}
        <Route
          path="*"
          element={
            <RouteErrorBoundary routeName="not-found">
              <Suspense fallback={<PageLoader />}>
                <NotFoundPage />
              </Suspense>
            </RouteErrorBoundary>
          }
        />
      </Routes>
    </BrowserRouter>
    </TooltipProvider>
  );
}

export default App;
