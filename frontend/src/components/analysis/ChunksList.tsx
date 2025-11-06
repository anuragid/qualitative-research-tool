import type { Chunk } from "../../types";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Clock } from "lucide-react";

interface ChunksListProps {
  chunks: Chunk[];
}

const chunkTypeColors = {
  quote: "bg-blue-100 text-blue-800",
  observation: "bg-green-100 text-green-800",
  context: "bg-purple-100 text-purple-800",
  fact: "bg-orange-100 text-orange-800",
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
                <div className="flex-shrink-0 w-20 text-sm text-gray-500 flex items-start gap-1">
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

                  <p className="text-gray-900 leading-relaxed">{chunk.text}</p>

                  <div className="mt-2 text-xs text-gray-400 font-mono">
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
