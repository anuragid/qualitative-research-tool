import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { Avatar, AvatarImage, AvatarFallback, AvatarBadge, AvatarGroup, AvatarGroupCount } from "./avatar";

const meta = {
  title: "Primitives/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "default", "lg"],
    },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithImage: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="https://github.com/shadcn.png" alt="User" />
      <AvatarFallback>CN</AvatarFallback>
    </Avatar>
  ),
};

export const WithFallback: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback>JD</AvatarFallback>
    </Avatar>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar size="sm">
        <AvatarFallback>SM</AvatarFallback>
      </Avatar>
      <Avatar size="default">
        <AvatarFallback>DF</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback>LG</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const Small: Story = {
  render: () => (
    <Avatar size="sm">
      <AvatarFallback>SM</AvatarFallback>
    </Avatar>
  ),
};

export const Large: Story = {
  render: () => (
    <Avatar size="lg">
      <AvatarFallback>LG</AvatarFallback>
    </Avatar>
  ),
};

export const Group: Story = {
  render: () => (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>BM</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>CK</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+5</AvatarGroupCount>
    </AvatarGroup>
  ),
};

export const WithBadge: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <Avatar size="sm">
        <AvatarFallback>SM</AvatarFallback>
        <AvatarBadge />
      </Avatar>
      <Avatar size="default">
        <AvatarFallback>DF</AvatarFallback>
        <AvatarBadge />
      </Avatar>
      <Avatar size="lg">
        <AvatarImage src="https://github.com/shadcn.png" alt="User" />
        <AvatarFallback>LG</AvatarFallback>
        <AvatarBadge />
      </Avatar>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const badges = canvas.getAllByTestId
      ? canvasElement.querySelectorAll('[data-slot="avatar-badge"]')
      : canvasElement.querySelectorAll('[data-slot="avatar-badge"]');
    await expect(badges.length).toBe(3);
  },
};

export const ResearchTeam: Story = {
  name: "Research Team Avatars",
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          <AvatarFallback>PI</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium text-text-primary">Principal Investigator</p>
          <p className="text-xs text-text-secondary">Dr. Sarah Johnson</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarFallback>RA</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium text-text-primary">Research Assistant</p>
          <p className="text-xs text-text-secondary">Mike Chen</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Avatar size="sm">
          <AvatarFallback>ST</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium text-text-primary">Student</p>
          <p className="text-xs text-text-secondary">Emily Park</p>
        </div>
      </div>
    </div>
  ),
};
