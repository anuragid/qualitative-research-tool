import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertBanner } from "./alert-banner";
import { Button } from "./button";

const meta = {
  title: "Composites/AlertBanner",
  component: AlertBanner,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Feedback banner for communicating status messages to the user.\n\n" +
          "**When to use:** Error, warning, info, or success messages that need prominent visibility.\n\n" +
          "**When NOT to use:** Empty states (use EmptyState) or inline form validation messages.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["error", "warning", "info", "success"],
    },
  },
} satisfies Meta<typeof AlertBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Error: Story = {
  args: {
    variant: "error",
    title: "Analysis failed",
    children: "The video analysis encountered an error. Please try again or contact support.",
  },
};

export const Warning: Story = {
  args: {
    variant: "warning",
    title: "Rate limit reached",
    children: "You have exceeded the free model rate limit. Please wait a moment before retrying.",
  },
};

export const Info: Story = {
  args: {
    variant: "info",
    title: "Tip",
    children: "You can bring your own API key for faster processing. Go to Settings to configure.",
  },
};

export const Success: Story = {
  args: {
    variant: "success",
    title: "Analysis complete",
    children: "All videos have been successfully analyzed. View the cross-video analysis for insights.",
  },
};

export const WithAction: Story = {
  name: "With Action Button",
  args: {
    variant: "error",
    title: "Upload failed",
    children: "The video could not be uploaded. The file may be too large or in an unsupported format.",
    action: (
      <Button variant="outline" size="sm">
        Try Again
      </Button>
    ),
  },
};

export const Dismissible: Story = {
  args: {
    variant: "info",
    children: "This is a dismissible info banner. Click the X to close it.",
    onDismiss: () => {},
  },
};

export const NoTitle: Story = {
  name: "Without Title",
  args: {
    variant: "warning",
    children: "Free models have strict rate limits (10-20 requests per minute). Consider using your own API key.",
  },
};

export const AllVariants: Story = {
  args: { variant: "error", children: "All variants shown below" },
  render: () => (
    <div className="space-y-4 max-w-lg">
      <AlertBanner variant="error" title="Error">
        Something went wrong. Please try again.
      </AlertBanner>
      <AlertBanner variant="warning" title="Warning">
        This action cannot be undone.
      </AlertBanner>
      <AlertBanner variant="info" title="Info">
        Your project has been saved as a draft.
      </AlertBanner>
      <AlertBanner variant="success" title="Success">
        All changes have been saved successfully.
      </AlertBanner>
    </div>
  ),
};
