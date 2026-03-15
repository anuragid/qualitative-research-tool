import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent } from "storybook/test";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";
import {
  DoExample,
  DontExample,
  DoAndDontGrid,
} from "../../stories/helpers/do-and-dont";

const meta = {
  title: "Primitives/Tabs",
  component: Tabs,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Content section switcher for organizing related views.\n\n" +
          "**When to use:** Switching between related content views within the same context (e.g., analysis steps).\n\n" +
          "**When NOT to use:** Primary navigation between pages (use sidebar links or router navigation).",
      },
    },
  },
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const chunksTab = canvas.getByRole("tab", { name: /chunks/i });
    await expect(chunksTab).toBeInTheDocument();
    await expect(chunksTab).toHaveAttribute("data-state", "active");
    const inferencesTab = canvas.getByRole("tab", { name: /inferences/i });
    await userEvent.click(inferencesTab);
    await expect(inferencesTab).toHaveAttribute("data-state", "active");
    await expect(canvas.getByText("Interpretations drawn from the chunks.")).toBeInTheDocument();
  },
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

export const DoAndDont: Story = {
  name: "Do / Don't",
  parameters: { layout: "padded" },
  render: () => (
    <DoAndDontGrid>
      <DoExample label="Use for switching between related content views">
        <Tabs defaultValue="chunks" className="w-full">
          <TabsList>
            <TabsTrigger value="chunks">Chunks</TabsTrigger>
            <TabsTrigger value="inferences">Inferences</TabsTrigger>
          </TabsList>
          <TabsContent value="chunks" className="p-3 text-sm">Analysis chunks content</TabsContent>
          <TabsContent value="inferences" className="p-3 text-sm">Inferences content</TabsContent>
        </Tabs>
      </DoExample>
      <DontExample label="Use for primary navigation (use sidebar links)">
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="p-3 text-sm">
            These are different pages, not related views
          </TabsContent>
        </Tabs>
      </DontExample>
    </DoAndDontGrid>
  ),
};
