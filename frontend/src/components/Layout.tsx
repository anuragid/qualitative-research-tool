import { type ReactNode, useState, useCallback } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./navigation/Sidebar";
import { Logo } from "./ui/logo";
import { UploadManager } from "./upload/UploadManager";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-surface-page">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={handleCloseSidebar} />

      {/* Mobile header bar */}
      <header
        className="fixed top-0 left-0 right-0 h-14 flex items-center px-4 bg-surface-card border-b border-border lg:hidden z-[var(--z-sticky)]"
      >
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 rounded-md text-text-secondary hover:text-foreground hover:bg-interactive-fill min-h-[var(--size-touch)] min-w-[var(--size-touch)] flex items-center justify-center transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)]"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <Logo size="sidebar" className="text-foreground ml-3" />
      </header>

      {/* Main content area */}
      <main className="lg:ml-72 pt-14 lg:pt-0 min-h-screen">
        <div className="p-4 sm:p-6">{children}</div>
      </main>

      {/* Global Upload Manager */}
      <UploadManager />
    </div>
  );
}
