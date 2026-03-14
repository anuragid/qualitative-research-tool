import type { Inference, Chunk } from "../../types";
import { Badge } from "../ui/Badge";
import { Lightbulb } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";
import { chunkTypeStyles } from "./config/displayConfig";
import { InferenceCard } from "./cards/InferenceCard";
import { CardView } from "./display/CardView";
import { TableView, type TableColumn } from "./display/TableView";
import type { ViewMode, SortConfig } from "./hooks/useAnalysisDisplay";

interface InferencesListProps {
  inferences: Inference[];
  chunks?: Chunk[];
  viewMode?: ViewMode;
  sort?: SortConfig | null;
  onSort?: (config: SortConfig | null) => void;
}

function makeInferenceColumns(chunks?: Chunk[]): TableColumn<Inference>[] {
  const getChunk = (chunkId: string) => chunks?.find((c) => c.chunk_id === chunkId);

  return [
    { key: "chunk_id", label: "Chunk", sortable: true, render: (inf) => {
      const chunk = getChunk(inf.chunk_id);
      const badgeStyle = chunk
        ? chunkTypeStyles[chunk.type]?.badge || "bg-base-04 text-base-55"
        : "bg-base-04 text-base-55";
      return (
        <div className="flex items-center gap-2">
          <Badge className={`${badgeStyle} text-label`}>{chunk?.type || "unknown"}</Badge>
          <span className="text-label text-base-40 font-mono">{inf.chunk_id}</span>
        </div>
      );
    }, className: "w-48" },
    { key: "count", label: "Count", sortable: true, render: (inf) => (
      <span className="text-sm text-base-62">{inf.inferences.length}</span>
    ), className: "w-20" },
    { key: "meaning", label: "First Inference", render: (inf) => (
      <p className="text-sm text-base-85 line-clamp-2">
        {inf.inferences[0]?.meaning || "\u2014"}
      </p>
    ) },
  ];
}

export function InferencesList({ inferences, chunks, viewMode = "list", sort, onSort }: InferencesListProps) {
  const getChunkById = (chunkId: string) => {
    return chunks?.find((c) => c.chunk_id === chunkId);
  };

  if (viewMode === "grid") {
    return (
      <CardView columns={2}>
        {inferences.map((inference, i) => (
          <InferenceCard
            key={inference.chunk_id || i}
            inference={inference}
            chunk={getChunkById(inference.chunk_id)}
            compact
          />
        ))}
      </CardView>
    );
  }

  if (viewMode === "table") {
    const columns = makeInferenceColumns(chunks);
    return (
      <TableView
        data={inferences}
        columns={columns}
        sort={sort || null}
        onSort={onSort || (() => {})}
      />
    );
  }

  // Default: list view (accordion)
  const totalInferences = inferences.reduce(
    (sum, inf) => sum + inf.inferences.length,
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-h4 text-foreground">
          Inferences ({totalInferences} from {inferences.length} chunks)
        </h3>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {inferences.map((inference) => {
          const chunk = getChunkById(inference.chunk_id);
          const badgeStyle = chunk ? (chunkTypeStyles[chunk.type]?.badge || "") : "";
          return (
            <AccordionItem key={inference.chunk_id} value={inference.chunk_id}>
              <div className="bg-card rounded-2xl overflow-hidden">
                <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-base-04">
                  <div className="flex items-start gap-3 text-left flex-1">
                    <Lightbulb className="h-5 w-5 text-brand-mustard flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-base-85">
                          {inference.inferences.length} inference
                          {inference.inferences.length !== 1 ? "s" : ""}
                        </span>
                        <Badge className={badgeStyle || "bg-base-04 text-base-55 border-0"}>
                          {chunk?.type || "unknown"}
                        </Badge>
                      </div>
                      {chunk && (
                        <p className="text-sm text-base-55 line-clamp-2">
                          {chunk.text}
                        </p>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-5 pb-5">
                  <div className="space-y-3 pl-8">
                    {inference.inferences.map((item) => (
                      <div
                        key={item.inference_id}
                        className="border-l-2 border-brand-mustard/40 pl-4 py-2"
                      >
                        <div className="mb-2">
                          <div className="text-label text-base-40 uppercase mb-1">
                            Meaning
                          </div>
                          <p className="text-base-85">{item.meaning}</p>
                        </div>

                        <div className="mb-2">
                          <div className="text-label text-base-40 uppercase mb-1">
                            Importance
                          </div>
                          <p className="text-base-55">{item.importance}</p>
                        </div>

                        <div>
                          <div className="text-label text-base-40 uppercase mb-1">
                            Context
                          </div>
                          <p className="text-base-55">{item.context}</p>
                        </div>

                        <div className="mt-2 text-label text-base-25 font-mono">
                          ID: {item.inference_id}
                        </div>
                      </div>
                    ))}
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
