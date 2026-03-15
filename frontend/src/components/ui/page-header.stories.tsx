import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus, Download, Settings } from "lucide-react";
import { PageHeader } from "./page-header";
import { Button } from "./button";
import { Badge } from "./badge";

const meta = {
  title: "Composites/PageHeader",
  component: PageHeader,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Projects",
    description: "Manage your qualitative research projects.",
  },
};

export const WithActions: Story = {
  name: "With Actions",
  args: {
    title: "Projects",
    description: "Manage your qualitative research projects.",
    actions: (
      <Button>
        <Plus className="h-4 w-4" />
        New Project
      </Button>
    ),
  },
};

export const WithBadge: Story = {
  name: "With Badge",
  args: {
    title: "User Research Spring 2026",
    description: "12 videos uploaded, 8 analyzed.",
    badge: <Badge variant="success">Completed</Badge>,
  },
};

export const WithBackLink: Story = {
  name: "With Back Link",
  args: {
    title: "Interview #3 - Sarah",
    description: "Recorded March 10, 2026",
    backLink: { to: "/projects/1", label: "Back to Project" },
    badge: <Badge variant="secondary">Analyzing</Badge>,
  },
};

export const FullFeatured: Story = {
  name: "Full Featured",
  args: {
    title: "5D Analysis Results",
    description: "Cross-video analysis across all participant interviews.",
    backLink: { to: "/projects/1", label: "Back to Project" },
    badge: <Badge variant="success">Complete</Badge>,
    actions: (
      <div className="flex items-center gap-2">
        <Button variant="outline">
          <Download className="h-4 w-4" />
          Export
        </Button>
        <Button variant="ghost" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    ),
  },
};

export const TitleOnly: Story = {
  name: "Title Only",
  args: {
    title: "Settings",
  },
};
