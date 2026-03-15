import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";

const meta = {
  title: "Primitives/Tabs",
  component: Tabs,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="chunks" className="w-[500px]">
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

export const TwoTabs: Story = {
  name: "Two Tabs (Simple)",
  render: () => (
    <Tabs defaultValue="overview" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="details">Details</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="p-4 text-text-primary">
        Project overview with pill-style active indicator.
      </TabsContent>
      <TabsContent value="details" className="p-4 text-text-secondary">
        Detailed analysis results with opacity-based text hierarchy.
      </TabsContent>
    </Tabs>
  ),
};

export const DisabledTab: Story = {
  render: () => (
    <Tabs defaultValue="available" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="available">Available</TabsTrigger>
        <TabsTrigger value="locked" disabled>Locked</TabsTrigger>
        <TabsTrigger value="coming">Coming Soon</TabsTrigger>
      </TabsList>
      <TabsContent value="available" className="p-4">This tab is active.</TabsContent>
      <TabsContent value="coming" className="p-4">This tab is also available.</TabsContent>
    </Tabs>
  ),
};
