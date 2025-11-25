import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { UploadProvider } from "./contexts/UploadContext";
import { useAuth } from "./hooks/useAuth";
import { useUserSync } from "./hooks/useUserSync";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import VideoDetailPage from "./pages/VideoDetailPage";
import LandingPage from "./pages/LandingPage";
import CognitoSignIn from "./components/auth/CognitoSignIn";

function App() {
  const { isSignedIn: isAuthenticated, isLoaded } = useAuth();

  // Sync user with backend when authenticated
  useUserSync();

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
              <CognitoSignIn />
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