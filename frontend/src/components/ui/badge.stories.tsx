import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";

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
  parameters: { layout: "centered" },
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
