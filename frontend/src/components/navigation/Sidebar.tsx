import { useCallback, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { FolderOpen, Settings, X } from "lucide-react";
import { UserButton } from "@clerk/react";
import { ModelSettingsDialog } from "../settings/ModelSettingsDialog";
import { useState } from "react";

interface SidebarProps {
  /** Whether the sidebar is open (mobile only — on desktop it's always visible) */
  isOpen: boolean;
  /** Callback to close the sidebar (mobile only) */
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

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
        className={`fixed inset-0 bg-black/30 dark:bg-black/50 transition-opacity lg:hidden ${
          isOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        style={{
          zIndex: "var(--z-sidebar)",
          transitionDuration: "var(--duration-normal)",
          transitionTimingFunction: "var(--ease)",
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-surface-card border-r border-border flex flex-col transition-transform ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
        style={{
          zIndex: "var(--z-sidebar)",
          transitionDuration: "var(--duration-normal)",
          transitionTimingFunction: "var(--ease)",
        }}
        aria-label="Main navigation"
      >
        {/* Top section: typemark + close button (mobile) */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <span className="text-h4 text-foreground select-none">
            method<span className="italic text-brand-burnt-orange">x</span>
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-base-55 hover:text-foreground hover:bg-base-04 lg:hidden"
            style={{
              transition:
                "color var(--duration-micro) var(--ease), background var(--duration-micro) var(--ease)",
            }}
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
              `flex items-center gap-3 h-8 px-3 rounded-lg text-ui ${
                isActive
                  ? "bg-base-08 text-foreground"
                  : "text-base-62 hover:bg-base-04 hover:text-foreground"
              }`
            }
            style={{
              transition:
                "color var(--duration-micro) var(--ease), background var(--duration-micro) var(--ease)",
            }}
          >
            <FolderOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
            All Projects
          </NavLink>

          {/* Settings section */}
          <div className="pt-6">
            <span className="px-3 text-label text-base-40 uppercase tracking-wider">
              Settings
            </span>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-3 h-8 px-3 rounded-lg text-ui text-base-62 hover:bg-base-04 hover:text-foreground w-full mt-1"
              style={{
                transition:
                  "color var(--duration-micro) var(--ease), background var(--duration-micro) var(--ease)",
              }}
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
