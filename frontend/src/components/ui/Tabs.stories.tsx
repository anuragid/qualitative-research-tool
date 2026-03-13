import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./Tabs";

const meta = {
  title: "UI/Tabs",
  component: Tabs,
  tags: ["autodocs"],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="chunks" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="chunks">Chunks</TabsTrigger>
        <TabsTrigger value="inferences">Inferences</TabsTrigger>
        <TabsTrigger value="patterns">Patterns</TabsTrigger>
        <TabsTrigger value="insights">Insights</TabsTrigger>
        <TabsTrigger value="principles">Principles</TabsTrigger>
      </TabsList>
      <TabsContent value="chunks" className="p-4">Meaningful segments extracted from the transcript.</TabsContent>
      <TabsContent value="inferences" className="p-4">Interpretations drawn from the chunks.</TabsContent>
      <TabsContent value="patterns" className="p-4">Recurring themes across inferences.</TabsContent>
      <TabsContent value="insights" className="p-4">Key findings from the patterns.</TabsContent>
      <TabsContent value="principles" className="p-4">Actionable principles derived from insights.</TabsContent>
    </Tabs>
  ),
};
