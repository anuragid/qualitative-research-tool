import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert, AlertTitle, AlertDescription } from "./alert";
import { AlertCircle, Info, Terminal, CheckCircle } from "lucide-react";

const meta = {
  title: "Primitives/Alert",
  component: Alert,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive"],
    },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Alert className="max-w-md">
      <Info className="size-4" />
      <AlertTitle>Information</AlertTitle>
      <AlertDescription>
        Your analysis is being processed. This may take a few minutes.
      </AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive" className="max-w-md">
      <AlertCircle className="size-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>
        Failed to process video. Please check the file format and try again.
      </AlertDescription>
    </Alert>
  ),
};

export const WithoutIcon: Story = {
  render: () => (
    <Alert className="max-w-md">
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>
        You can add components to your app using the CLI.
      </AlertDescription>
    </Alert>
  ),
};

export const WithTerminalIcon: Story = {
  name: "Terminal Alert",
  render: () => (
    <Alert className="max-w-md">
      <Terminal className="size-4" />
      <AlertTitle>Processing complete</AlertTitle>
      <AlertDescription>
        All 5 videos have been transcribed and analyzed successfully.
      </AlertDescription>
    </Alert>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4 max-w-md">
      <Alert>
        <Info className="size-4" />
        <AlertTitle>Default (Info)</AlertTitle>
        <AlertDescription>
          This is an informational alert with a blue-tinted background.
        </AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>Destructive (Error)</AlertTitle>
        <AlertDescription>
          This is a destructive alert with a red-tinted background.
        </AlertDescription>
      </Alert>
    </div>
  ),
};

export const ResearchContext: Story = {
  name: "Research Tool Context",
  render: () => (
    <div className="flex flex-col gap-4 max-w-md">
      <Alert>
        <CheckCircle className="size-4" />
        <AlertTitle>Analysis Ready</AlertTitle>
        <AlertDescription>
          3 of 5 dimensions have been analyzed. Click "Continue" to process the remaining dimensions.
        </AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>Transcription Failed</AlertTitle>
        <AlertDescription>
          The audio quality in "interview-03.mp4" was too low. Consider re-recording or uploading a cleaner file.
        </AlertDescription>
      </Alert>
    </div>
  ),
};
