import type { Pattern } from "../../types";
import { Badge } from "../ui/badge";
import { Network } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { relationshipTypeStyles, frequencyStyles } from "./config/displayConfig";
import { PatternCard } from "./cards/PatternCard";
import { CardView } from "./display/CardView";
import { TableView, type TableColumn } from "./display/TableView";
import type { ViewMode, SortConfig } from "./hooks/useAnalysisDisplay";

interface PatternsListProps {
  patterns: Pattern[];
  viewMode?: ViewMode;
  sort?: SortConfig | null;
  onSort?: (config: SortConfig | null) => void;
}

const patternColumns: TableColumn<Pattern>[] = [
  { key: "pattern_name", label: "Name", sortable: true, render: (p) => (
    <span className="font-semibold text-sm text-text-primary">{p.pattern_name}</span>
  ) },
  { key: "relationship_type", label: "Relationship", sortable: true, render: (p) => (
    <Badge className={`${relationshipTypeStyles[p.relationship_type] || ""} text-label`}>
      {p.relationship_type}
    </Badge>
  ), className: "w-32" },
  { key: "frequency", label: "Frequency", sortable: true, render: (p) => (
    <Badge className={`${frequencyStyles[p.frequency] || ""} text-label`}>
      {p.frequency}
    </Badge>
  ), className: "w-28" },
  { key: "description", label: "Description", render: (p) => (
    <p className="text-sm text-text-tertiary line-clamp-2">{p.description}</p>
  ) },
  { key: "related_inferences", label: "Inferences", sortable: false, render: (p) => (
    <span className="text-sm text-text-placeholder">{(p.related_inferences ?? []).length}</span>
  ), className: "w-24" },
];

export function PatternsList({ patterns, viewMode = "list", sort, onSort }: PatternsListProps) {
  // Defensive guard — prop may be null/undefined. See PR #21.
  const safePatterns = patterns ?? [];

  if (viewMode === "grid") {
    return (
      <CardView columns={2}>
        {safePatterns.map((pattern, i) => (
          <PatternCard key={pattern.pattern_id || i} pattern={pattern} compact />
        ))}
      </CardView>
    );
  }

  if (viewMode === "table") {
    return (
      <TableView
        data={safePatterns}
        columns={patternColumns}
        sort={sort || null}
        onSort={onSort || (() => {})}
        getRowKey={(p) => p.pattern_id}
      />
    );
  }

  // Default: list view (accordion)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-h4 text-foreground">
          Patterns ({safePatterns.length})
        </h3>
        <div className="flex gap-2 text-sm">
          {Object.entries(relationshipTypeStyles)
            .filter(([type]) => safePatterns.some((p) => p.relationship_type === type))
            .map(([type, style]) => (
              <Badge key={type} className={style}>
                {type}
              </Badge>
            ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {safePatterns.map((pattern) => {
          const relatedInferences = pattern.related_inferences ?? [];
          return (
          <AccordionItem key={pattern.pattern_id} value={pattern.pattern_id}>
            <div className="bg-card rounded-2xl overflow-hidden">
              <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-interactive-fill">
                <div className="flex items-start gap-3 text-left flex-1">
                  <Network className="h-5 w-5 text-brand-maroon flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-text-primary">{pattern.pattern_name}</span>
                      <Badge className={relationshipTypeStyles[pattern.relationship_type]}>
                        {pattern.relationship_type}
                      </Badge>
                      <Badge className={frequencyStyles[pattern.frequency]}>
                        {pattern.frequency} frequency
                      </Badge>
                    </div>
                    <p className="text-sm text-text-tertiary line-clamp-2">
                      {pattern.description}
                    </p>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-5 pb-5">
                <div className="space-y-4 pl-8">
                  <div>
                    <div className="text-label text-text-placeholder uppercase mb-2">
                      Description
                    </div>
                    <p className="text-text-primary">{pattern.description}</p>
                  </div>

                  <div>
                    <div className="text-label text-text-placeholder uppercase mb-2">
                      Significance
                    </div>
                    <p className="text-text-primary">{pattern.significance}</p>
                  </div>

                  <div>
                    <div className="text-label text-text-placeholder uppercase mb-2">
                      Related Inferences ({relatedInferences.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {relatedInferences.map((infId) => (
                        <Badge key={infId} variant="outline" className="font-mono text-xs text-text-tertiary border-border">
                          {infId}
                        </Badge>
                      ))}
                    </div>
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
