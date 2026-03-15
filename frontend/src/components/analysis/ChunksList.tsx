import type { Chunk } from "../../types";
import { Badge } from "../ui/Badge";
import { chunkTypeStyles } from "./config/displayConfig";
import { ChunkCard } from "./cards/ChunkCard";
import { CardView } from "./display/CardView";
import { TableView, type TableColumn } from "./display/TableView";
import type { ViewMode, SortConfig } from "./hooks/useAnalysisDisplay";

interface ChunksListProps {
  chunks: Chunk[];
  viewMode?: ViewMode;
  sort?: SortConfig | null;
  onSort?: (config: SortConfig | null) => void;
}

const chunkColumns: TableColumn<Chunk>[] = [
  { key: "type", label: "Type", sortable: true, render: (c) => (
    <Badge className={`${chunkTypeStyles[c.type]?.badge || ""} text-label`}>{c.type}</Badge>
  ), className: "w-28" },
  { key: "speaker", label: "Speaker", sortable: true, render: (c) => (
    <span className="text-sm text-text-secondary">{c.speaker || "\u2014"}</span>
  ), className: "w-32" },
  { key: "text", label: "Content", render: (c) => (
    <p className="text-sm text-text-primary line-clamp-2">{c.text}</p>
  ) },
  { key: "timestamp", label: "Time", sortable: true, render: (c) => (
    <span className="text-label text-text-placeholder">{c.timestamp || "\u2014"}</span>
  ), className: "w-24" },
];

export function ChunksList({ chunks, viewMode = "list", sort, onSort }: ChunksListProps) {
  if (viewMode === "grid") {
    return (
      <CardView columns={3}>
        {chunks.map((chunk, i) => (
          <ChunkCard key={chunk.chunk_id || i} chunk={chunk} compact />
        ))}
      </CardView>
    );
  }

  if (viewMode === "table") {
    return (
      <TableView
        data={chunks}
        columns={chunkColumns}
        sort={sort || null}
        onSort={onSort || (() => {})}
      />
    );
  }

  // Default: list view
  return (
    <div className="space-y-3">
      {chunks.map((chunk, i) => (
        <ChunkCard key={chunk.chunk_id || i} chunk={chunk} />
      ))}
    </div>
  );
}
