import type { Inference, Chunk } from "../../types";
import { Badge } from "../ui/Badge";
import { Lightbulb } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";

interface InferencesListProps {
  inferences: Inference[];
  chunks?: Chunk[];
}

const chunkTypeBadgeStyles: Record<string, string> = {
  quote: "bg-brand-forest/10 text-brand-forest border-0",
  fact: "bg-brand-mustard/10 text-brand-mustard border-0",
  context: "bg-brand-maroon/10 text-brand-maroon border-0",
  observation: "bg-brand-olive/10 text-brand-olive border-0",
};

export function InferencesList({ inferences, chunks }: InferencesListProps) {
  const getChunkById = (chunkId: string) => {
    return chunks?.find((c) => c.chunk_id === chunkId);
  };

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
          const badgeStyle = chunk ? (chunkTypeBadgeStyles[chunk.type] || "") : "";
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
