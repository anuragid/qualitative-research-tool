import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import { UploadProvider } from "./contexts/UploadContext";
import { useUserSync } from "./hooks/useUserSync";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import VideoDetailPage from "./pages/VideoDetailPage";
import LandingPage from "./pages/LandingPage";

function App() {
  // Sync user with backend when authenticated
  useUserSync();

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route
          path="/"
          element={
            <>
              <SignedIn>
                <Navigate to="/projects" replace />
              </SignedIn>
              <SignedOut>
                <LandingPage />
              </SignedOut>
            </>
          }
        />

        {/* Protected routes */}
        <Route
          path="/projects"
          element={
            <>
              <SignedIn>
                <UploadProvider>
                  <ProjectsPage />
                </UploadProvider>
              </SignedIn>
              <SignedOut>
                <RedirectToSignIn />
              </SignedOut>
            </>
          }
        />

        <Route
          path="/projects/:projectId"
          element={
            <>
              <SignedIn>
                <UploadProvider>
                  <ProjectDetailPage />
                </UploadProvider>
              </SignedIn>
              <SignedOut>
                <RedirectToSignIn />
              </SignedOut>
            </>
          }
        />

        <Route
          path="/videos/:videoId"
          element={
            <>
              <SignedIn>
                <UploadProvider>
                  <VideoDetailPage />
                </UploadProvider>
              </SignedIn>
              <SignedOut>
                <RedirectToSignIn />
              </SignedOut>
            </>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
