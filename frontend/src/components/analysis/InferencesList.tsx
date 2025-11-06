import type { Inference, Chunk } from "../../types";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Lightbulb } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";

interface InferencesListProps {
  inferences: Inference[];
  chunks?: Chunk[];
}

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
        <h3 className="text-lg font-semibold">
          Inferences ({totalInferences} from {inferences.length} chunks)
        </h3>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {inferences.map((inference) => {
          const chunk = getChunkById(inference.chunk_id);
          return (
            <AccordionItem key={inference.chunk_id} value={inference.chunk_id}>
              <Card>
                <CardContent className="p-0">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50">
                    <div className="flex items-start gap-3 text-left flex-1">
                      <Lightbulb className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">
                            {inference.inferences.length} inference
                            {inference.inferences.length !== 1 ? "s" : ""}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {chunk?.type || "unknown"}
                          </Badge>
                        </div>
                        {chunk && (
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {chunk.text}
                          </p>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-3 pl-8">
                      {inference.inferences.map((item) => (
                        <div
                          key={item.inference_id}
                          className="border-l-2 border-amber-200 pl-4 py-2"
                        >
                          <div className="mb-2">
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                              Meaning
                            </div>
                            <p className="text-gray-900">{item.meaning}</p>
                          </div>

                          <div className="mb-2">
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                              Importance
                            </div>
                            <p className="text-gray-700">{item.importance}</p>
                          </div>

                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                              Context
                            </div>
                            <p className="text-gray-700">{item.context}</p>
                          </div>

                          <div className="mt-2 text-xs text-gray-400 font-mono">
                            ID: {item.inference_id}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </CardContent>
              </Card>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
