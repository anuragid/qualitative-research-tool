import { ChevronsUpDown, ChevronsDownUp } from "lucide-react";

interface ExpandCollapseToggleProps {
  expanded: "all" | "none" | Set<string>;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function ExpandCollapseToggle({ expanded, onExpandAll, onCollapseAll }: ExpandCollapseToggleProps) {
  const isAllExpanded = expanded === "all";

  return (
    <button
      onClick={isAllExpanded ? onCollapseAll : onExpandAll}
      className="h-8 px-2 text-ui text-text-placeholder hover:text-text-secondary rounded-md hover:bg-interactive-fill flex items-center gap-1.5 transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)]"
      aria-label={isAllExpanded ? "Collapse all" : "Expand all"}
    >
      {isAllExpanded ? (
        <><ChevronsDownUp className="h-3.5 w-3.5" /> Collapse</>
      ) : (
        <><ChevronsUpDown className="h-3.5 w-3.5" /> Expand</>
      )}
    </button>
  );
}
