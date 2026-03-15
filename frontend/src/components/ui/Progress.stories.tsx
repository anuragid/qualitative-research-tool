import type { Meta, StoryObj } from "@storybook/react-vite";
import { Progress } from "./Progress";

const meta = {
  title: "Primitives/Progress",
  component: Progress,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { value: 60, className: "w-[300px]" } };
export const Empty: Story = { args: { value: 0, className: "w-[300px]" } };
export const Full: Story = { args: { value: 100, className: "w-[300px]" } };
export const Indeterminate: Story = { args: { className: "w-[300px]" } };

export const UploadProgress: Story = {
  name: "Upload Progress States",
  render: () => (
    <div className="w-[300px] space-y-4">
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-text-primary">interview_01.mp4</span>
          <span className="text-text-placeholder">25%</span>
        </div>
        <Progress value={25} />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-text-primary">interview_02.mp4</span>
          <span className="text-text-placeholder">75%</span>
        </div>
        <Progress value={75} />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-text-primary">interview_03.mp4</span>
          <span className="text-brand-forest">Complete</span>
        </div>
        <Progress value={100} />
      </div>
    </div>
  ),
};
