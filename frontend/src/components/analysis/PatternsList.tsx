import type { Pattern } from "../../types";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Network } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";

interface PatternsListProps {
  patterns: Pattern[];
}

const relationshipTypeColors = {
  convergent: "bg-green-100 text-green-800",
  divergent: "bg-purple-100 text-purple-800",
  tension: "bg-red-100 text-red-800",
  causal: "bg-blue-100 text-blue-800",
};

const frequencyColors = {
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-gray-100 text-gray-800",
};

export function PatternsList({ patterns }: PatternsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Patterns ({patterns.length})
        </h3>
        <div className="flex gap-2 text-sm">
          {Object.entries(relationshipTypeColors).map(([type, color]) => (
            <Badge key={type} className={color}>
              {type}
            </Badge>
          ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {patterns.map((pattern) => (
          <AccordionItem key={pattern.pattern_id} value={pattern.pattern_id}>
            <Card>
              <CardContent className="p-0">
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50">
                  <div className="flex items-start gap-3 text-left flex-1">
                    <Network className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold">{pattern.pattern_name}</span>
                        <Badge className={relationshipTypeColors[pattern.relationship_type]}>
                          {pattern.relationship_type}
                        </Badge>
                        <Badge className={frequencyColors[pattern.frequency]}>
                          {pattern.frequency} frequency
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {pattern.description}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-4 pl-8">
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        Description
                      </div>
                      <p className="text-gray-900">{pattern.description}</p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        Significance
                      </div>
                      <p className="text-gray-900">{pattern.significance}</p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        Related Inferences ({pattern.related_inferences.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {pattern.related_inferences.map((infId) => (
                          <Badge key={infId} variant="outline" className="font-mono text-xs">
                            {infId}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="text-xs text-gray-400 font-mono">
                      ID: {pattern.pattern_id}
                    </div>
                  </div>
                </AccordionContent>
              </CardContent>
            </Card>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
