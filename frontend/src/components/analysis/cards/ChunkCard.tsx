import { Badge } from "../../ui/Badge";
import { Clock } from "lucide-react";
import { chunkTypeStyles } from "../config/displayConfig";
import type { Chunk } from "../../../types";

interface ChunkCardProps {
  chunk: Chunk;
  compact?: boolean; // true for grid view (shorter)
}

export function ChunkCard({ chunk, compact = false }: ChunkCardProps) {
  const styles = chunkTypeStyles[chunk.type] || chunkTypeStyles.quote;

  return (
    <div className={`bg-card rounded-xl p-3 sm:p-4 border-l-4 ${styles.border}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <Badge className={`${styles.badge} text-label`}>{chunk.type}</Badge>
        {chunk.speaker && (
          <span className="text-label text-text-placeholder">{chunk.speaker}</span>
        )}
      </div>
      <p className={`text-sm text-text-primary ${compact ? "line-clamp-3" : ""}`}>
        {chunk.text}
      </p>
      {chunk.timestamp && (
        <div className="flex items-center gap-1 mt-2 text-label text-text-placeholder">
          <Clock className="h-3 w-3" />
          <span>{chunk.timestamp}</span>
        </div>
      )}
    </div>
  );
}
