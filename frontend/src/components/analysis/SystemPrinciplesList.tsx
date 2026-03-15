import type { SystemPrinciple } from "../../types";
import { Badge } from "../ui/badge";
import { Compass, Lightbulb } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { priorityStyles, scopeStyles } from "./config/displayConfig";
import { SystemPrincipleCard } from "./cards/SystemPrincipleCard";
import { CardView } from "./display/CardView";
import { TableView, type TableColumn } from "./display/TableView";
import type { ViewMode, SortConfig } from "./hooks/useAnalysisDisplay";

interface SystemPrinciplesListProps {
  systemPrinciples: SystemPrinciple[];
  viewMode?: ViewMode;
  sort?: SortConfig | null;
  onSort?: (config: SortConfig | null) => void;
}

const systemPrincipleColumns: TableColumn<SystemPrinciple>[] = [
  {
    key: "principle",
    label: "Principle",
    sortable: true,
    render: (sp) => (
      <span className="font-semibold text-sm text-text-primary">{sp.principle}</span>
    ),
  },
  {
    key: "priority",
    label: "Priority",
    sortable: true,
    render: (sp) => {
      const pStyle = priorityStyles[sp.priority] || priorityStyles.medium;
      return (
        <Badge className={`${pStyle.badge} text-label`}>
          {sp.priority}
        </Badge>
      );
    },
    className: "w-28",
  },
  {
    key: "scope",
    label: "Scope",
    sortable: true,
    render: (sp) => (
      <Badge className={`${scopeStyles[sp.scope] || ""} text-label`}>
        {sp.scope}
      </Badge>
    ),
    className: "w-32",
  },
  {
    key: "how_might_we.length",
    label: "HMW Questions",
    sortable: true,
    render: (sp) => (
      <span className="text-sm text-text-tertiary">{sp.how_might_we.length}</span>
    ),
    className: "w-32",
  },
];

export function SystemPrinciplesList({ systemPrinciples, viewMode = "list", sort, onSort }: SystemPrinciplesListProps) {
  if (viewMode === "grid") {
    return (
      <CardView columns={2}>
        {systemPrinciples.map((principle) => (
          <SystemPrincipleCard key={principle.system_principle_id} principle={principle} compact />
        ))}
      </CardView>
    );
  }

  if (viewMode === "table") {
    return (
      <TableView
        data={systemPrinciples}
        columns={systemPrincipleColumns}
        sort={sort || null}
        onSort={onSort || (() => {})}
      />
    );
  }

  // Default: list view (accordion behavior)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-h4 text-foreground">
          System-Level Design Principles ({systemPrinciples.length})
        </h3>
        <div className="flex gap-2 text-sm">
          {Object.entries(priorityStyles)
            .filter(([priority]) => systemPrinciples.some((sp) => sp.priority === priority))
            .map(([priority, style]) => (
              <Badge key={priority} className={style.badge}>
                {priority}
              </Badge>
            ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {systemPrinciples.map((principle) => {
          const pStyle = priorityStyles[principle.priority] || priorityStyles.medium;
          return (
            <AccordionItem key={principle.system_principle_id} value={principle.system_principle_id}>
              <div className={`bg-card rounded-2xl overflow-hidden border-l-4 ${pStyle.border}`}>
                <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-interactive-fill">
                  <div className="flex items-start gap-3 text-left flex-1">
                    <Compass className="h-5 w-5 text-brand-maroon flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge className={pStyle.badge}>
                          {principle.priority} priority
                        </Badge>
                        <Badge className={scopeStyles[principle.scope]}>
                          {principle.scope}
                        </Badge>
                      </div>
                      <h4 className="font-semibold text-base text-text-primary">
                        {principle.principle}
                      </h4>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-5 pb-5">
                  <div className="space-y-4 pl-8">
                    <div>
                      <div className="text-label text-text-placeholder uppercase mb-2">
                        Principle
                      </div>
                      <p className="text-text-primary text-base font-medium leading-relaxed">
                        {principle.principle}
                      </p>
                    </div>

                    <div>
                      <div className="text-label text-text-placeholder uppercase mb-2">
                        Rationale
                      </div>
                      <p className="text-text-tertiary leading-relaxed">
                        {principle.rationale}
                      </p>
                    </div>

                    <div>
                      <div className="text-label text-text-placeholder uppercase mb-2">
                        Context Considerations
                      </div>
                      <p className="text-text-tertiary leading-relaxed">
                        {principle.context_considerations}
                      </p>
                    </div>

                    <div>
                      <div className="text-label text-text-placeholder uppercase mb-2 flex items-center gap-2">
                        <Lightbulb className="h-4 w-4" />
                        Strategic How Might We... ({principle.how_might_we.length})
                      </div>
                      <ul className="space-y-3">
                        {principle.how_might_we.map((hmw, idx) => (
                          <li key={idx} className="flex gap-2 p-3 bg-brand-pale-blue/30 rounded-xl border border-interactive-focus-border/20">
                            <span className="text-interactive-focus font-semibold">{idx + 1}.</span>
                            <span className="text-text-primary">{hmw}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="text-label text-text-placeholder uppercase mb-2">
                        Related Cross-Video Insight
                      </div>
                      <Badge variant="outline" className="font-mono text-xs text-text-tertiary border-border">
                        {principle.cross_insight_id}
                      </Badge>
                    </div>

                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
