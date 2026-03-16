import { type ReactNode, useState, useCallback } from "react";
import { Menu, PanelLeft } from "lucide-react";
import { Sidebar } from "./navigation/Sidebar";
import { Logo } from "./ui/logo";
import { UploadManager } from "./upload/UploadManager";

interface LayoutProps {
  children: ReactNode;
}

const SIDEBAR_COLLAPSED_KEY = "methodex-sidebar-collapsed";

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  });

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-surface-page">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={handleCloseSidebar}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

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

      {/* Desktop expand button (visible when sidebar is collapsed) */}
      {sidebarCollapsed && (
        <button
          onClick={handleToggleCollapse}
          className="fixed top-4 left-4 hidden lg:flex p-2 rounded-md text-text-tertiary hover:text-foreground hover:bg-interactive-fill bg-surface-card border border-border shadow-sm z-[var(--z-sticky)] items-center justify-center transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)]"
          aria-label="Expand sidebar"
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      {/* Main content area */}
      <main className={`pt-14 lg:pt-0 min-h-screen transition-[margin] duration-[var(--duration-normal)] ease-[var(--ease)] ${sidebarCollapsed ? "lg:ml-0" : "lg:ml-72"}`}>
        <div className="p-4 sm:p-6">{children}</div>
      </main>

      {/* Global Upload Manager */}
      <UploadManager />
    </div>
  );
}
