import type { Meta, StoryObj } from "@storybook/react-vite";
import { BackLink } from "./back-link";

const meta = {
  title: "Composites/BackLink",
  component: BackLink,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof BackLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    to: "/projects",
    children: "Back to Projects",
  },
};

export const BackToVideos: Story = {
  name: "Back to Videos",
  args: {
    to: "/projects/1/videos",
    children: "Back to Videos",
  },
};

export const BackToDashboard: Story = {
  name: "Back to Dashboard",
  args: {
    to: "/",
    children: "Dashboard",
  },
};
