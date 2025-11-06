import type { DesignPrinciple } from "../../types";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Compass, Lightbulb } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";

interface PrinciplesListProps {
  principles: DesignPrinciple[];
}

const priorityColors = {
  high: "bg-red-100 text-red-800 border-red-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low: "bg-blue-100 text-blue-800 border-blue-300",
};

export function PrinciplesList({ principles }: PrinciplesListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Design Principles ({principles.length})
        </h3>
        <div className="flex gap-2 text-sm">
          {Object.entries(priorityColors).map(([priority, color]) => (
            <Badge key={priority} className={color}>
              {priority} priority
            </Badge>
          ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {principles.map((principle) => (
          <AccordionItem key={principle.principle_id} value={principle.principle_id}>
            <Card className={`border-l-4 ${
              principle.priority === "high"
                ? "border-l-red-400"
                : principle.priority === "medium"
                ? "border-l-yellow-400"
                : "border-l-blue-400"
            }`}>
              <CardContent className="p-0">
                <AccordionTrigger className="px-4 py-4 hover:no-underline hover:bg-gray-50">
                  <div className="flex items-start gap-3 text-left flex-1">
                    <Compass className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={priorityColors[principle.priority]}>
                          {principle.priority} priority
                        </Badge>
                      </div>
                      <h4 className="font-semibold text-base">
                        {principle.principle}
                      </h4>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-4 pl-8">
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        Principle
                      </div>
                      <p className="text-gray-900 text-base font-medium leading-relaxed">
                        {principle.principle}
                      </p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        Rationale
                      </div>
                      <p className="text-gray-700 leading-relaxed">
                        {principle.rationale}
                      </p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-2">
                        <Lightbulb className="h-4 w-4" />
                        How Might We... ({principle.how_might_we.length})
                      </div>
                      <ul className="space-y-3">
                        {principle.how_might_we.map((hmw, idx) => (
                          <li key={idx} className="flex gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                            <span className="text-blue-600 font-semibold">{idx + 1}.</span>
                            <span className="text-gray-900">{hmw}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        Related Insight
                      </div>
                      <Badge variant="outline" className="font-mono text-xs">
                        {principle.insight_id}
                      </Badge>
                    </div>

                    <div className="text-xs text-gray-400 font-mono">
                      ID: {principle.principle_id}
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
