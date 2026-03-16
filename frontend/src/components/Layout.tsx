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

      {/* Desktop sidebar rail (visible when sidebar is collapsed) */}
      <aside
        className={`fixed top-0 left-0 h-full w-[var(--size-touch)] hidden lg:flex flex-col items-center pt-[var(--space-page-gutter)] bg-surface-card border-r border-border z-[var(--z-sticky)] transition-opacity duration-[var(--duration-normal)] ease-[var(--ease)] ${
          sidebarCollapsed
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        aria-label="Expand navigation"
      >
        <button
          onClick={handleToggleCollapse}
          className="p-2 rounded-md text-text-tertiary hover:text-foreground hover:bg-interactive-fill transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)]"
          aria-label="Expand sidebar"
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      </aside>

      {/* Main content area */}
      <main className={`pt-14 lg:pt-0 min-h-screen transition-[margin] duration-[var(--duration-normal)] ease-[var(--ease)] ${sidebarCollapsed ? "lg:ml-[var(--size-touch)]" : "lg:ml-[var(--space-sidebar-width)]"}`}>
        <div className="p-4 sm:p-6">{children}</div>
      </main>

      {/* Global Upload Manager */}
      <UploadManager />
    </div>
  );
}
