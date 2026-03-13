import { type ReactNode, useState, useCallback } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./navigation/Sidebar";
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
        className="fixed top-0 left-0 right-0 h-14 flex items-center px-4 bg-surface-card border-b border-border lg:hidden"
        style={{ zIndex: "var(--z-sticky)" }}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 rounded-md text-base-62 hover:text-foreground hover:bg-base-04"
          style={{
            transition:
              "color var(--duration-micro) var(--ease), background var(--duration-micro) var(--ease)",
          }}
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="text-h4 text-foreground ml-3 select-none">
          method<span className="italic text-brand-burnt-orange">x</span>
        </span>
      </header>

      {/* Main content area */}
      <main className="lg:ml-72 pt-14 lg:pt-0 min-h-screen">
        <div className="p-6">{children}</div>
      </main>

      {/* Global Upload Manager */}
      <UploadManager />
    </div>
  );
}
