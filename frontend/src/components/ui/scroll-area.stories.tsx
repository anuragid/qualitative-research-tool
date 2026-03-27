import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScrollArea, ScrollBar } from "./scroll-area";
import { Separator } from "./separator";

const meta = {
  title: "Primitives/ScrollArea",
  component: ScrollArea,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

const tags = Array.from({ length: 50 }, (_, i) => `Tag ${i + 1}`);

export const Vertical: Story = {
  render: () => (
    <ScrollArea className="h-72 w-48 rounded-lg border border-border">
      <div className="p-4">
        <h4 className="mb-4 text-ui text-text-primary">Tags</h4>
        {tags.map((tag) => (
          <div key={tag}>
            <div className="text-sm text-text-secondary py-1">{tag}</div>
            <Separator />
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

const items = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  title: `Video ${i + 1}`,
  duration: `${Math.floor(Math.random() * 30 + 1)}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`,
}));

export const Horizontal: Story = {
  render: () => (
    <ScrollArea className="w-96 whitespace-nowrap rounded-lg border border-border">
      <div className="flex w-max space-x-4 p-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="w-40 shrink-0 rounded-lg border border-border bg-surface-card p-3"
          >
            <div className="text-ui text-text-primary">{item.title}</div>
            <div className="text-xs text-text-tertiary">{item.duration}</div>
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};

export const BothDirections: Story = {
  render: () => (
    <ScrollArea className="h-72 w-80 rounded-lg border border-border">
      <div className="w-[600px] p-4">
        <h4 className="mb-4 text-ui text-text-primary">
          Analysis Results Matrix
        </h4>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Participant", "Theme A", "Theme B", "Theme C", "Theme D", "Theme E"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-text-secondary font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 20 }, (_, i) => (
              <tr key={i} className="border-b border-border">
                <td className="px-3 py-2 text-text-primary">P{i + 1}</td>
                {["A", "B", "C", "D", "E"].map((t) => (
                  <td key={t} className="px-3 py-2 text-text-tertiary">
                    {Math.random() > 0.5 ? "Yes" : "No"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};
