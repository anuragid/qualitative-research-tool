import { Badge } from "../../ui/badge";
import { Lightbulb } from "lucide-react";
import { chunkTypeStyles } from "../config/displayConfig";
import type { Inference, Chunk } from "../../../types";

interface InferenceCardProps {
  inference: Inference;
  chunk?: Chunk;
  compact?: boolean;
}

export function InferenceCard({ inference, chunk, compact = false }: InferenceCardProps) {
  // Defensive guard — jsonb field may be null at runtime. See PR #21.
  const items = inference.inferences ?? [];
  const badgeStyle = chunk
    ? chunkTypeStyles[chunk.type]?.badge || "bg-interactive-fill text-text-tertiary"
    : "bg-interactive-fill text-text-tertiary";

  return (
    <div className="bg-card rounded-xl p-3 sm:p-4">
      <div className="flex items-start gap-2 mb-2">
        <Lightbulb className="h-4 w-4 text-brand-mustard flex-shrink-0 mt-0.5" />
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`${badgeStyle} text-label`}>
            {chunk?.type || "unknown"}
          </Badge>
          <span className="text-label text-text-placeholder font-mono">
            {inference.chunk_id}
          </span>
        </div>
      </div>

      {compact ? (
        <p className="text-sm text-text-primary">
          {items.length} inference{items.length !== 1 ? "s" : ""}
          {chunk && (
            <span className="text-text-placeholder ml-1 line-clamp-1">
              &mdash; {chunk.text}
            </span>
          )}
        </p>
      ) : (
        <div className="space-y-2 mt-2">
          {chunk && (
            <p className="text-sm text-text-tertiary line-clamp-2 mb-3">
              {chunk.text}
            </p>
          )}
          {items.map((item) => (
            <div
              key={item.inference_id}
              className="border-l-2 border-brand-mustard/40 pl-3 py-1"
            >
              <p className="text-sm text-text-primary">{item.meaning}</p>
              <p className="text-label text-text-placeholder mt-1">{item.importance}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
