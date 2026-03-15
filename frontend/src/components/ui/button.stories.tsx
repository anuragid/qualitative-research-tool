import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent } from "storybook/test";
import { Button } from "./button";
import { Loader2, Mail, Plus, ArrowRight, Download, Trash2 } from "lucide-react";
import {
  DoExample,
  DontExample,
  DoAndDontGrid,
} from "../../stories/helpers/do-and-dont";

const meta = {
  title: "Primitives/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "outline", "secondary", "ghost", "link"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon"],
    },
    disabled: { control: "boolean" },
  },
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Primary action trigger for user interactions.\n\n" +
          "**When to use:** Form submissions, CTAs, toolbar actions, and any clickable action.\n\n" +
          "**When NOT to use:** Navigation links (use `<a>` or router Link) or state toggles (use Toggle/Switch).",
      },
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: "Button", variant: "default" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button");
    await expect(button).toBeInTheDocument();
    await userEvent.click(button);
  },
};

export const Destructive: Story = {
  args: { children: "Delete", variant: "destructive" },
};

export const Outline: Story = {
  args: { children: "Outline", variant: "outline" },
};

export const Secondary: Story = {
  args: { children: "Secondary", variant: "secondary" },
};

export const Ghost: Story = {
  args: { children: "Ghost", variant: "ghost" },
};

export const Link: Story = {
  args: { children: "Link", variant: "link" },
};

export const WithIcon: Story = {
  render: () => (
    <Button>
      <Mail className="mr-2 size-4" /> Login with Email
    </Button>
  ),
};

export const WithTrailingIcon: Story = {
  render: () => (
    <Button variant="outline">
      Continue <ArrowRight className="ml-2 size-4" />
    </Button>
  ),
};

export const Loading: Story = {
  render: () => (
    <Button disabled>
      <Loader2 className="mr-2 size-4 animate-spin" /> Please wait
    </Button>
  ),
};

export const IconButton: Story = {
  args: { size: "icon", children: <Plus className="size-4" /> },
};

export const AllVariants: Story = {
  name: "All Variants (pill vs rounded)",
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button variant="default">Default (pill)</Button>
      <Button variant="destructive">Destructive (pill)</Button>
      <Button variant="outline">Outline (pill)</Button>
      <Button variant="secondary">Secondary (rounded-lg)</Button>
      <Button variant="ghost">Ghost (rounded-md)</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon"><Plus className="size-4" /></Button>
    </div>
  ),
};

export const DisabledStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button disabled>Default</Button>
      <Button variant="destructive" disabled>Destructive</Button>
      <Button variant="outline" disabled>Outline</Button>
      <Button variant="secondary" disabled>Secondary</Button>
      <Button variant="ghost" disabled>Ghost</Button>
    </div>
  ),
};

export const DoAndDont: Story = {
  name: "Do / Don't",
  parameters: { layout: "padded" },
  render: () => (
    <DoAndDontGrid>
      <DoExample label="Use ghost variant for secondary actions in toolbars">
        <div className="flex gap-2">
          <Button variant="ghost" size="sm">
            <Download className="mr-2 size-4" /> Export
          </Button>
          <Button variant="ghost" size="sm">Share</Button>
        </div>
      </DoExample>
      <DontExample label="Use destructive variant for non-destructive actions">
        <Button variant="destructive">Save Changes</Button>
      </DontExample>
      <DoExample label="Include an icon before text for actions">
        <div className="flex gap-2">
          <Button>
            <Download className="mr-2 size-4" /> Download
          </Button>
          <Button>
            <Mail className="mr-2 size-4" /> Email
          </Button>
        </div>
      </DoExample>
      <DontExample label="Use a button when a link would be more appropriate">
        <Button variant="default">Go to Dashboard</Button>
      </DontExample>
    </DoAndDontGrid>
  ),
};
