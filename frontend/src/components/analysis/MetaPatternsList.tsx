import type { MetaPattern } from "../../types";
import { Badge } from "../ui/badge";
import { Network } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { consistencyStyles } from "./config/displayConfig";
import { MetaPatternCard } from "./cards/MetaPatternCard";
import { CardView } from "./display/CardView";
import { TableView, type TableColumn } from "./display/TableView";
import type { ViewMode, SortConfig } from "./hooks/useAnalysisDisplay";

interface MetaPatternsListProps {
  metaPatterns: MetaPattern[];
  viewMode?: ViewMode;
  sort?: SortConfig | null;
  onSort?: (config: SortConfig | null) => void;
  videoNames?: Record<string, string>;
}

const metaPatternColumns: TableColumn<MetaPattern>[] = [
  {
    key: "pattern_name",
    label: "Pattern",
    sortable: true,
    render: (mp) => (
      <span className="font-semibold text-sm text-text-primary">{mp.pattern_name}</span>
    ),
  },
  {
    key: "consistency",
    label: "Consistency",
    sortable: true,
    render: (mp) => (
      <Badge className={`${consistencyStyles[mp.consistency] || ""} text-label`}>
        {mp.consistency}
      </Badge>
    ),
    className: "w-32",
  },
  {
    key: "appears_in_videos.length",
    label: "Videos",
    sortable: true,
    render: (mp) => (
      <Badge className="bg-interactive-focus-bg text-interactive-focus text-label">
        {mp.appears_in_videos.length}
      </Badge>
    ),
    className: "w-24",
  },
  {
    key: "significance",
    label: "Significance",
    render: (mp) => (
      <p className="text-sm text-text-tertiary line-clamp-2">{mp.significance}</p>
    ),
  },
];

export function MetaPatternsList({ metaPatterns, viewMode = "list", sort, onSort, videoNames }: MetaPatternsListProps) {
  if (viewMode === "grid") {
    return (
      <CardView columns={2}>
        {metaPatterns.map((metaPattern) => (
          <MetaPatternCard key={metaPattern.meta_pattern_id} metaPattern={metaPattern} compact />
        ))}
      </CardView>
    );
  }

  if (viewMode === "table") {
    return (
      <TableView
        data={metaPatterns}
        columns={metaPatternColumns}
        sort={sort || null}
        onSort={onSort || (() => {})}
      />
    );
  }

  // Default: list view (accordion behavior)
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-h4 text-foreground">
          Meta-Patterns ({metaPatterns.length})
        </h3>
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(consistencyStyles)
            .filter(([key]) =>
              ["consistent", "varying", "contradictory"].includes(key) &&
              metaPatterns.some((mp) => mp.consistency === key)
            )
            .map(([type, style]) => (
              <Badge key={type} className={style}>
                {type}
              </Badge>
            ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {metaPatterns.map((metaPattern) => (
          <AccordionItem key={metaPattern.meta_pattern_id} value={metaPattern.meta_pattern_id}>
            <div className="bg-card rounded-2xl overflow-hidden">
              <AccordionTrigger className="px-3 sm:px-5 py-4 hover:no-underline hover:bg-interactive-fill">
                <div className="flex items-start gap-3 text-left flex-1">
                  <Network className="h-5 w-5 text-interactive-focus flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-text-primary">{metaPattern.pattern_name}</span>
                      <Badge className={consistencyStyles[metaPattern.consistency]}>
                        {metaPattern.consistency}
                      </Badge>
                      <Badge className="bg-interactive-focus-bg text-interactive-focus border-0">
                        {metaPattern.appears_in_videos.length} videos
                      </Badge>
                    </div>
                    <p className="text-sm text-text-tertiary line-clamp-2">
                      {metaPattern.description}
                    </p>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-3 sm:px-5 pb-5">
                <div className="space-y-4 pl-4 sm:pl-8">
                  <div>
                    <div className="text-label text-text-placeholder uppercase mb-2">
                      Description
                    </div>
                    <p className="text-text-primary">{metaPattern.description}</p>
                  </div>

                  <div>
                    <div className="text-label text-text-placeholder uppercase mb-2">
                      Significance
                    </div>
                    <p className="text-text-primary">{metaPattern.significance}</p>
                  </div>

                  <div>
                    <div className="text-label text-text-placeholder uppercase mb-2">
                      Context Sensitivity
                    </div>
                    <p className="text-text-primary">{metaPattern.context_sensitivity}</p>
                  </div>

                  <div>
                    <div className="text-label text-text-placeholder uppercase mb-2">
                      Appears In Videos ({metaPattern.appears_in_videos.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {metaPattern.appears_in_videos.map((videoId, index) => (
                        <Badge key={videoId} variant="outline" className="text-xs text-text-tertiary border-border">
                          {videoNames?.[videoId] || `Video ${index + 1}`}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-label text-text-placeholder uppercase mb-2">
                      Related Patterns ({metaPattern.related_patterns.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {metaPattern.related_patterns.map((patternId) => (
                        <Badge key={patternId} variant="outline" className="font-mono text-xs text-text-tertiary border-border">
                          {patternId}
                        </Badge>
                      ))}
                    </div>
                  </div>

                </div>
              </AccordionContent>
            </div>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
