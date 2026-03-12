import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FolderKanban } from "lucide-react";
import { Show, SignInButton, UserButton } from "@clerk/react";
import { UploadManager } from "./upload/UploadManager";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/projects" className="flex items-center gap-2">
            <FolderKanban className="h-6 w-6" />
            <span className="text-xl font-bold">Qualitative Research Tool</span>
          </Link>

          <div className="flex items-center gap-4">
            <Show when="signed-out">
              <SignInButton>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  Sign In
                </button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-6">{children}</main>

      {/* Global Upload Manager */}
      <UploadManager />
    </div>
  );
}
