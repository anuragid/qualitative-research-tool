import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { UploadProvider } from "./contexts/UploadContext";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import VideoDetailPage from "./pages/VideoDetailPage";

function App() {
  return (
    <UploadProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/videos/:videoId" element={<VideoDetailPage />} />
        </Routes>
      </BrowserRouter>
    </UploadProvider>
  );
}

export default App;
