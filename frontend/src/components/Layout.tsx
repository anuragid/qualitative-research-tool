import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FolderKanban } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="container mx-auto flex h-16 items-center px-4">
          <Link to="/projects" className="flex items-center gap-2">
            <FolderKanban className="h-6 w-6" />
            <span className="text-xl font-bold">Qualitative Research Tool</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-6">{children}</main>
    </div>
  );
}
