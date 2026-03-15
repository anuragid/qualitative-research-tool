import { useCallback, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { FolderOpen, Settings, Sun, Moon, Monitor, X } from "lucide-react";
import { UserButton } from "@clerk/react";
import { ModelSettingsDialog } from "../settings/ModelSettingsDialog";
import { useTheme } from "../../hooks/useTheme.tsx";
import { useState } from "react";

interface SidebarProps {
  /** Whether the sidebar is open (mobile only — on desktop it's always visible) */
  isOpen: boolean;
  /** Callback to close the sidebar (mobile only) */
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { theme, setTheme } = useTheme();

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
        className={`fixed top-0 left-0 h-full w-[85vw] max-w-72 lg:w-72 bg-surface-card border-r border-border flex flex-col transition-transform z-[var(--z-sidebar)] duration-[var(--duration-normal)] ease-[var(--ease)] ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
        aria-label="Main navigation"
      >
        {/* Top section: typemark + close button (mobile) */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <span className="text-h4 text-foreground select-none">
            method<span className="text-brand-burnt-orange">ex</span>
          </span>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-base-55 hover:text-foreground hover:bg-base-04 lg:hidden min-h-[var(--size-touch)] min-w-[var(--size-touch)] flex items-center justify-center transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)]"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Sidebar">
          <NavLink
            to="/projects"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 h-10 px-3 rounded-lg text-ui transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                isActive
                  ? "bg-base-08 text-foreground"
                  : "text-base-62 hover:bg-base-04 hover:text-foreground"
              }`
            }
          >
            <FolderOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
            All Projects
          </NavLink>

          {/* Settings section */}
          <div className="pt-6">
            <span className="px-3 text-label text-base-40 uppercase tracking-wider">
              Settings
            </span>
            <span className="px-3 text-label text-base-40 mt-2 block">Theme</span>
            <div className="flex items-center gap-1 px-3 mt-1">
              <button
                onClick={() => setTheme("light")}
                className={`p-2 rounded-lg transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                  theme === "light" ? "bg-base-08 text-foreground" : "text-base-40 hover:text-base-62 hover:bg-base-04"
                }`}
                aria-label="Light theme"
              >
                <Sun className="h-4 w-4" />
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`p-2 rounded-lg transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                  theme === "dark" ? "bg-base-08 text-foreground" : "text-base-40 hover:text-base-62 hover:bg-base-04"
                }`}
                aria-label="Dark theme"
              >
                <Moon className="h-4 w-4" />
              </button>
              <button
                onClick={() => setTheme("system")}
                className={`p-2 rounded-lg transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                  theme === "system" ? "bg-base-08 text-foreground" : "text-base-40 hover:text-base-62 hover:bg-base-04"
                }`}
                aria-label="System theme"
              >
                <Monitor className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-3 h-10 px-3 rounded-lg text-ui text-base-62 hover:bg-base-04 hover:text-foreground w-full mt-1 transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)]"
            >
              <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
              Model Settings
            </button>
          </div>
        </nav>

        {/* Bottom section: user button */}
        <div className="px-5 py-4 border-t border-border">
          <UserButton
            appearance={{
              elements: {
                rootBox: "flex items-center",
                userButtonTrigger: "focus:outline-none focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2",
              },
            }}
          />
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
