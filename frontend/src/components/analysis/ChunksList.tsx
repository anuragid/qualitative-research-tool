import type { Chunk } from "../../types";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Clock } from "lucide-react";

interface ChunksListProps {
  chunks: Chunk[];
}

const chunkTypeColors = {
  quote: "bg-chart-1/10 text-chart-1",
  observation: "bg-chart-4/10 text-chart-4",
  context: "bg-chart-3/10 text-chart-3",
  fact: "bg-chart-2/10 text-chart-2",
};

const chunkTypeIcons = {
  quote: "\"",
  observation: "👁️",
  context: "🔍",
  fact: "📊",
};

export function ChunksList({ chunks }: ChunksListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Chunks ({chunks.length})
        </h3>
        <div className="flex gap-2 text-sm">
          {Object.entries(chunkTypeColors).map(([type, color]) => (
            <Badge key={type} className={color}>
              {type}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {chunks.map((chunk) => (
          <Card key={chunk.chunk_id}>
            <CardContent className="pt-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-20 text-sm text-muted-foreground flex items-start gap-1">
                  <Clock className="h-3 w-3 mt-0.5" />
                  <span className="text-xs">{chunk.timestamp}</span>
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={chunkTypeColors[chunk.type]}>
                      {chunkTypeIcons[chunk.type]} {chunk.type}
                    </Badge>
                    <Badge variant="outline">
                      {chunk.speaker}
                    </Badge>
                  </div>

                  <p className="text-foreground leading-relaxed">{chunk.text}</p>

                  <div className="mt-2 text-xs text-muted-foreground/60 font-mono">
                    ID: {chunk.chunk_id}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
