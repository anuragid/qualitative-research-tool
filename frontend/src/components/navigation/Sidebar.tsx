import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { FolderOpen, Folder, Settings, Sun, Moon, Monitor, X, PanelLeftClose } from "lucide-react";
import { UserButton } from "@clerk/react";

const DEV_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === "true";
import { ModelSettingsDialog } from "../settings/ModelSettingsDialog";
import { Logo } from "../ui/logo";
import { SimpleTooltip } from "../ui/tooltip";
import { useTheme } from "../../hooks/useTheme.tsx";
import { useProjects } from "../../hooks/useProjects";

interface SidebarProps {
  /** Whether the sidebar is open (mobile only — on desktop it's always visible) */
  isOpen: boolean;
  /** Callback to close the sidebar (mobile only) */
  onClose: () => void;
  /** Whether the sidebar is collapsed on desktop */
  isCollapsed: boolean;
  /** Toggle sidebar collapsed state on desktop */
  onToggleCollapse: () => void;
}

export function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }: SidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { data: projects } = useProjects();

  // Theme cycling: light → dark → system → light
  const cycleTheme = useCallback(() => {
    const next = { light: "dark", dark: "system", system: "light" } as const;
    setTheme(next[theme]);
  }, [theme, setTheme]);

  const themeIcon = {
    light: <Sun className="h-4 w-4" />,
    dark: <Moon className="h-4 w-4" />,
    system: <Monitor className="h-4 w-4" />,
  }[theme];

  const themeLabel = {
    light: "Theme: Light",
    dark: "Theme: Dark",
    system: "Theme: System",
  }[theme];

  // Close sidebar on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 bg-[var(--color-overlay)] transition-opacity z-[var(--z-sidebar)] duration-[var(--duration-normal)] ease-[var(--ease)] lg:hidden ${
          isOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <aside
        className={`fixed top-0 left-0 h-full w-[85vw] max-w-[var(--space-sidebar-width)] lg:w-[var(--space-sidebar-width)] bg-surface-card border-r border-border flex flex-col transition-transform z-[var(--z-sidebar)] duration-[var(--duration-normal)] ease-[var(--ease)] ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } ${isCollapsed ? "lg:-translate-x-full" : "lg:translate-x-0"}`}
        aria-label="Main navigation"
      >
        {/* Top section: logo + collapse/close buttons */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <Logo size="sidebar" className="text-foreground" />
          <div className="flex items-center gap-1">
            {/* Desktop collapse button */}
            <button
              onClick={onToggleCollapse}
              className="hidden lg:flex p-2 rounded-md text-text-tertiary hover:text-foreground hover:bg-interactive-fill items-center justify-center transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)]"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            </button>
            {/* Mobile close button */}
            <button
              onClick={onClose}
              className="p-2 rounded-md text-text-tertiary hover:text-foreground hover:bg-interactive-fill lg:hidden min-h-[var(--size-touch)] min-w-[var(--size-touch)] flex items-center justify-center transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)]"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Sidebar">
          <NavLink
            to="/projects"
            end
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 h-10 px-3 rounded-lg text-ui transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                isActive
                  ? "bg-interactive-hover text-foreground"
                  : "text-text-secondary hover:bg-interactive-fill hover:text-foreground"
              }`
            }
          >
            <FolderOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
            All Projects
          </NavLink>

          {/* Project list */}
          {Array.isArray(projects) && projects.length > 0 && (
            <div className="pt-1 space-y-0.5">
              {projects.map((project) => (
                <NavLink
                  key={project.id}
                  to={`/projects/${project.id}`}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 h-9 px-3 pl-7 rounded-lg text-sm transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                      isActive
                        ? "bg-interactive-hover text-foreground"
                        : "text-text-secondary hover:bg-interactive-fill hover:text-foreground"
                    }`
                  }
                >
                  <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{project.name}</span>
                </NavLink>
              ))}
            </div>
          )}
        </nav>

        {/* Bottom section: theme + user + settings */}
        <div className="px-5 py-4 border-t border-border">
          <div className="flex items-center justify-between">
            <SimpleTooltip content={themeLabel} side="top">
              <button
                onClick={cycleTheme}
                className="p-2 rounded-md text-text-tertiary hover:text-foreground hover:bg-interactive-fill transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)]"
                aria-label={themeLabel}
              >
                {themeIcon}
              </button>
            </SimpleTooltip>

            {DEV_BYPASS ? (
              <SimpleTooltip content="Dev User" side="top">
                <div className="w-7 h-7 rounded-full bg-interactive-fill flex items-center justify-center text-xs font-medium text-foreground border border-border">
                  D
                </div>
              </SimpleTooltip>
            ) : (
              <UserButton
                appearance={{
                  elements: {
                    rootBox: "flex items-center",
                    userButtonTrigger: "focus:outline-none focus-visible:outline-2 focus-visible:outline-interactive-focus focus-visible:outline-offset-2",
                  },
                }}
              />
            )}

            <SimpleTooltip content="Model Settings" side="top">
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-md text-text-tertiary hover:text-foreground hover:bg-interactive-fill transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)]"
                aria-label="Model Settings"
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
              </button>
            </SimpleTooltip>
          </div>
        </div>
      </aside>

      {/* Model Settings Dialog */}
      <ModelSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </>
  );
}
