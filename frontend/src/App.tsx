import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SignIn, SignUp } from "@clerk/react";
import { Toaster } from "sonner";
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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
