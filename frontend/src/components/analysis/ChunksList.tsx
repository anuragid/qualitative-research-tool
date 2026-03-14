import type { Chunk } from "../../types";
import { Badge } from "../ui/Badge";
import { Clock } from "lucide-react";

interface ChunksListProps {
  chunks: Chunk[];
}

const chunkTypeStyles: Record<string, { border: string; badge: string }> = {
  quote: {
    border: "border-l-brand-forest",
    badge: "bg-brand-forest/10 text-brand-forest border-0",
  },
  fact: {
    border: "border-l-brand-mustard",
    badge: "bg-brand-mustard/10 text-brand-mustard border-0",
  },
  context: {
    border: "border-l-brand-maroon",
    badge: "bg-brand-maroon/10 text-brand-maroon border-0",
  },
  observation: {
    border: "border-l-brand-olive",
    badge: "bg-brand-olive/10 text-brand-olive border-0",
  },
};

const chunkTypeIcons: Record<string, string> = {
  quote: "\"",
  observation: "O",
  context: "C",
  fact: "F",
};

export function ChunksList({ chunks }: ChunksListProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-h4 text-foreground">
          Chunks ({chunks.length})
        </h3>
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(chunkTypeStyles).map(([type, style]) => (
            <Badge key={type} className={style.badge}>
              {type}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {chunks.map((chunk) => {
          const style = chunkTypeStyles[chunk.type] || chunkTypeStyles.observation;
          return (
            <div
              key={chunk.chunk_id}
              className={`bg-card rounded-2xl p-3 sm:p-5 border-l-4 ${style.border}`}
            >
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-14 sm:w-20 text-label text-base-40 flex items-start gap-1">
                  <Clock className="h-3 w-3 mt-0.5" />
                  <span>{chunk.timestamp}</span>
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={style.badge}>
                      {chunkTypeIcons[chunk.type]} {chunk.type}
                    </Badge>
                    <Badge variant="outline" className="text-base-55 border-base-09">
                      {chunk.speaker}
                    </Badge>
                  </div>

                  <p className="text-base-85 leading-relaxed">{chunk.text}</p>

                  <div className="mt-2 text-label text-base-25 font-mono">
                    ID: {chunk.chunk_id}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
