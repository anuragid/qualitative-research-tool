import type { DesignPrinciple } from "../../types";
import { Badge } from "../ui/Badge";
import { Compass, Lightbulb } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";

interface PrinciplesListProps {
  principles: DesignPrinciple[];
}

const priorityStyles: Record<string, string> = {
  high: "bg-brand-crimson/10 text-brand-crimson border-0",
  medium: "bg-brand-mustard/10 text-brand-mustard border-0",
  low: "bg-accent-blue-bg text-accent-blue border-0",
};

const priorityBorderStyles: Record<string, string> = {
  high: "border-l-brand-crimson",
  medium: "border-l-brand-mustard",
  low: "border-l-accent-blue",
};

export function PrinciplesList({ principles }: PrinciplesListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-h4 text-foreground">
          Design Principles ({principles.length})
        </h3>
        <div className="flex gap-2 text-sm">
          {Object.entries(priorityStyles).map(([priority, style]) => (
            <Badge key={priority} className={style}>
              {priority} priority
            </Badge>
          ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {principles.map((principle) => (
          <AccordionItem key={principle.principle_id} value={principle.principle_id}>
            <div className={`bg-card rounded-2xl overflow-hidden border-l-4 ${
              priorityBorderStyles[principle.priority] || "border-l-accent-blue"
            }`}>
              <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-base-04">
                <div className="flex items-start gap-3 text-left flex-1">
                  <Compass className="h-5 w-5 text-accent-blue flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={priorityStyles[principle.priority]}>
                        {principle.priority} priority
                      </Badge>
                    </div>
                    <h4 className="font-semibold text-base text-base-85">
                      {principle.principle}
                    </h4>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-5 pb-5">
                <div className="space-y-4 pl-8">
                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Principle
                    </div>
                    <p className="text-base-85 text-base font-medium leading-relaxed">
                      {principle.principle}
                    </p>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Rationale
                    </div>
                    <p className="text-base-55 leading-relaxed">
                      {principle.rationale}
                    </p>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4" />
                      How Might We... ({principle.how_might_we.length})
                    </div>
                    <ul className="space-y-3">
                      {principle.how_might_we.map((hmw, idx) => (
                        <li key={idx} className="flex gap-2 p-3 bg-brand-pale-blue/30 rounded-xl border border-accent-blue-border/20">
                          <span className="text-accent-blue font-semibold">{idx + 1}.</span>
                          <span className="text-base-85">{hmw}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Related Insight
                    </div>
                    <Badge variant="outline" className="font-mono text-xs text-base-55 border-base-09">
                      {principle.insight_id}
                    </Badge>
                  </div>

                  <div className="text-label text-base-25 font-mono">
                    ID: {principle.principle_id}
                  </div>
                </div>
              </AccordionContent>
            </div>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
