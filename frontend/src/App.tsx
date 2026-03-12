import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SignInButton, SignUpButton } from "@clerk/react";
import { UploadProvider } from "./contexts/UploadContext";
import { useAuth } from "./hooks/useAuth";
import { useUserSync } from "./hooks/useUserSync";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import VideoDetailPage from "./pages/VideoDetailPage";
import LandingPage from "./pages/LandingPage";

function SignInPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h2 className="text-3xl font-extrabold text-gray-900 mb-8">
          Sign in to your account
        </h2>
        <div className="flex flex-col gap-4 items-center">
          <SignInButton>
            <button className="w-64 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              Sign In
            </button>
          </SignInButton>
          <SignUpButton>
            <button className="w-64 px-6 py-3 border border-blue-600 text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors">
              Create Account
            </button>
          </SignUpButton>
        </div>
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  return (
    <BrowserRouter>
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
