import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";
import {
  DoExample,
  DontExample,
  DoAndDontGrid,
} from "../../stories/helpers/do-and-dont";

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline", "success", "warning"],
    },
  },
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Status indicator for counts, categories, and labels.\n\n" +
          "**When to use:** Counts, categories, status labels, and metadata tags.\n\n" +
          "**When NOT to use:** Interactive toggles (use Toggle or Switch instead).",
      },
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: "Badge" } };
export const Secondary: Story = { args: { children: "Secondary", variant: "secondary" } };
export const Destructive: Story = { args: { children: "Error", variant: "destructive" } };
export const Outline: Story = { args: { children: "Outline", variant: "outline" } };
export const Success: Story = { args: { children: "Completed", variant: "success" } };
export const Warning: Story = { args: { children: "Processing", variant: "warning" } };

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Error</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="success">Completed</Badge>
      <Badge variant="warning">Processing</Badge>
    </div>
  ),
};

export const ProjectStatuses: Story = {
  name: "Project Status Badges",
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="secondary">Planning</Badge>
      <Badge variant="secondary">Ready</Badge>
      <Badge variant="warning">Processing</Badge>
      <Badge variant="success">Completed</Badge>
      <Badge variant="outline">Archived</Badge>
      <Badge variant="destructive">Error</Badge>
    </div>
  ),
};

export const DoAndDont: Story = {
  name: "Do / Don't",
  parameters: { layout: "padded" },
  render: () => (
    <DoAndDontGrid>
      <DoExample label="Use semantic variants for status">
        <div className="flex gap-2">
          <Badge variant="success">Completed</Badge>
          <Badge variant="warning">Processing</Badge>
          <Badge variant="destructive">Failed</Badge>
        </div>
      </DoExample>
      <DontExample label="Use badges for interactive elements (use Toggle instead)">
        <div className="flex gap-2">
          <Badge className="cursor-pointer">Click me</Badge>
          <Badge variant="secondary" className="cursor-pointer">Toggle</Badge>
        </div>
      </DontExample>
    </DoAndDontGrid>
  ),
};
