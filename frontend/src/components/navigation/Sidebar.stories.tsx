import type { Meta, StoryObj } from "@storybook/react-vite";
import { ClerkProvider } from "@clerk/react";
import { Sidebar } from "./Sidebar";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "pk_test_placeholder";

const meta = {
  title: "Navigation/Sidebar",
  component: Sidebar,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <ClerkProvider publishableKey={CLERK_KEY}>
        <div className="h-screen w-full bg-surface-page relative">
          <Story />
        </div>
      </ClerkProvider>
    ),
  ],
  argTypes: {
    isOpen: { control: "boolean" },
  },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isOpen: true,
    onClose: () => {},
  },
};

export const Closed: Story = {
  args: {
    isOpen: false,
    onClose: () => {},
  },
};
