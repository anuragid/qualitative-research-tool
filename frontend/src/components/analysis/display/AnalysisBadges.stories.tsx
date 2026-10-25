import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { Badge } from "../../ui/badge";
import {
  chunkTypeStyles,
  insightTypeStyles,
  priorityStyles,
  confidenceStyles,
  frequencyStyles,
  relationshipTypeStyles,
  consistencyStyles,
  scopeStyles,
  fallbackBadgeStyle,
  countBadgeStyle,
} from "../config/displayConfig";

const mapValues = <T,>(styles: Record<string, T>, pick: (style: T) => string) =>
  Object.fromEntries(Object.entries(styles).map(([key, style]) => [key, pick(style)]));

const groups: { name: string; styles: Record<string, string> }[] = [
  { name: "Chunk type", styles: mapValues(chunkTypeStyles, (s) => s.badge) },
  { name: "Insight type", styles: insightTypeStyles },
  { name: "Priority", styles: mapValues(priorityStyles, (s) => s.badge) },
  { name: "Confidence", styles: confidenceStyles },
  { name: "Frequency", styles: frequencyStyles },
  { name: "Relationship", styles: relationshipTypeStyles },
  { name: "Consistency", styles: consistencyStyles },
  { name: "Scope", styles: scopeStyles },
  { name: "Other", styles: { "no chunk type": fallbackBadgeStyle, "3 videos": countBadgeStyle } },
];

/**
 * Every badge style from `displayConfig`, on the card surface the analysis
 * views put them on. Switch the theme toolbar to check both themes.
 */
function AnalysisBadges() {
  return (
    <div className="bg-card rounded-2xl p-4 space-y-3">
      {groups.map((group) => (
        <div key={group.name} className="flex flex-wrap items-center gap-2">
          <span className="w-28 text-label text-text-secondary">{group.name}</span>
          {Object.entries(group.styles).map(([value, style]) => (
            <Badge key={value} className={`${style} text-label`}>
              {value}
            </Badge>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-label text-text-secondary">References</span>
        <Badge variant="outline" className="font-mono text-xs border-border">
          pattern_3
        </Badge>
      </div>
    </div>
  );
}

const meta = {
  title: "Analysis/Badges",
  component: AnalysisBadges,
  parameters: { layout: "padded" },
} satisfies Meta<typeof AnalysisBadges>;

export default meta;
type Story = StoryObj<typeof meta>;

const play: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByText("observation")).toBeInTheDocument();
  await expect(canvas.getByText("critical")).toBeInTheDocument();
};

export const Light: Story = {
  globals: { theme: "Light" },
  play,
};

export const Dark: Story = {
  globals: { theme: "Dark" },
  play,
};
