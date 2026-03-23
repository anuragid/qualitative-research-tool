import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { SignIn, SignUp } from "@clerk/react";
import { Toaster } from "sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { UploadProvider } from "./contexts/UploadContext";
import { useAuth } from "./hooks/useAuth";
import { useUserSync } from "./hooks/useUserSync";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import VideoDetailPage from "./pages/VideoDetailPage";
import LandingPage from "./pages/LandingPage";

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
              <LandingPage />
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

        {/* Protected routes */}
        <Route
          path="/projects"
          element={
            isAuthenticated ? (
              <UploadProvider>
                <ProjectsPage />
              </UploadProvider>
            ) : (
              <Navigate to="/sign-in" replace />
            )
          }
        />

        <Route
          path="/projects/:projectId"
          element={
            isAuthenticated ? (
              <UploadProvider>
                <ProjectDetailPage />
              </UploadProvider>
            ) : (
              <Navigate to="/sign-in" replace />
            )
          }
        />

        <Route
          path="/videos/:videoId"
          element={
            isAuthenticated ? (
              <UploadProvider>
                <VideoDetailPage />
              </UploadProvider>
            ) : (
              <Navigate to="/sign-in" replace />
            )
          }
        />

        {/* Catch-all 404 route */}
        <Route
          path="*"
          element={
            <div className="flex min-h-screen items-center justify-center bg-surface-page px-4">
              <div className="w-full max-w-md text-center">
                <h1 className="mb-2 text-2xl font-semibold text-foreground">
                  Page Not Found
                </h1>
                <p className="mb-6 text-text-secondary">
                  The page you are looking for does not exist.
                </p>
                <Link
                  to="/"
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-interactive-focus focus-visible:outline-offset-2"
                >
                  Go Home
                </Link>
              </div>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
    </TooltipProvider>
  );
}

export default App;
