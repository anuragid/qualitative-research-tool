import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusBadge } from "./status-badge";
import type { VideoStatus } from "./status-badge";

const meta = {
  title: "Composites/StatusBadge",
  component: StatusBadge,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    status: {
      control: "select",
      options: [
        "pending",
        "uploading",
        "uploaded",
        "transcribing",
        "transcribed",
        "analyzing",
        "analyzed",
        "error",
        "paused",
      ] satisfies VideoStatus[],
    },
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = { args: { status: "pending" } };
export const Uploading: Story = { args: { status: "uploading" } };
export const Uploaded: Story = { args: { status: "uploaded" } };
export const Transcribing: Story = { args: { status: "transcribing" } };
export const Transcribed: Story = { args: { status: "transcribed" } };
export const Analyzing: Story = { args: { status: "analyzing" } };
export const Analyzed: Story = { args: { status: "analyzed" } };
export const ErrorStatus: Story = { args: { status: "error" } };
export const Paused: Story = { args: { status: "paused" } };

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="pending" />
      <StatusBadge status="uploading" />
      <StatusBadge status="uploaded" />
      <StatusBadge status="transcribing" />
      <StatusBadge status="transcribed" />
      <StatusBadge status="analyzing" />
      <StatusBadge status="analyzed" />
      <StatusBadge status="error" />
      <StatusBadge status="paused" />
    </div>
  ),
};

export const VideoProcessingPipeline: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-body-sm text-text-tertiary w-24">Step 1:</span>
        <StatusBadge status="uploaded" />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-body-sm text-text-tertiary w-24">Step 2:</span>
        <StatusBadge status="transcribing" />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-body-sm text-text-tertiary w-24">Step 3:</span>
        <StatusBadge status="pending" />
      </div>
    </div>
  ),
};
