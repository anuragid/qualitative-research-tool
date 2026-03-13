import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, Settings } from "lucide-react";
import { Show, UserButton } from "@clerk/react";
import { UploadManager } from "./upload/UploadManager";
import { ModelSettingsDialog } from "./settings/ModelSettingsDialog";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <nav className="container mx-auto flex h-16 items-center justify-between px-4" aria-label="Main navigation">
          <Link to="/projects" className="flex items-center gap-2">
            <FolderKanban className="h-6 w-6" aria-hidden="true" />
            <span className="text-xl font-bold">Qualitative Research Tool</span>
          </Link>

          <div className="flex items-center gap-4">
            <Show when="signed-out">
              <Link to="/sign-in" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                Sign In
              </Link>
            </Show>
            <Show when="signed-in">
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Model Settings"
              >
                <Settings className="h-5 w-5" aria-hidden="true" />
              </button>
              <UserButton />
            </Show>
          </div>
        </nav>
      </header>

      <ModelSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Main Content */}
      <main className="container mx-auto p-6">{children}</main>

      {/* Global Upload Manager */}
      <UploadManager />
    </div>
  );
}
