import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "./switch";
import { Label } from "./label";

const meta = {
  title: "Primitives/Switch",
  component: Switch,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Switch />,
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Switch id="notifications" />
      <Label htmlFor="notifications">Enable notifications</Label>
    </div>
  ),
};

export const Checked: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Switch id="auto-analyze" defaultChecked />
      <Label htmlFor="auto-analyze">Auto-analyze on upload</Label>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Switch id="disabled-off" disabled />
        <Label htmlFor="disabled-off" className="text-text-disabled">
          Disabled (off)
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <Switch id="disabled-on" disabled defaultChecked />
        <Label htmlFor="disabled-on" className="text-text-disabled">
          Disabled (on)
        </Label>
      </div>
    </div>
  ),
};

export const SettingsExample: Story = {
  name: "Settings Panel",
  render: () => (
    <div className="w-80 space-y-4 rounded-lg border border-border bg-surface-card p-4">
      <h3 className="text-ui text-text-primary">Analysis Settings</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="s1" className="text-sm text-text-secondary">
            Auto-transcribe videos
          </Label>
          <Switch id="s1" defaultChecked />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="s2" className="text-sm text-text-secondary">
            Include timestamps
          </Label>
          <Switch id="s2" defaultChecked />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="s3" className="text-sm text-text-secondary">
            Cross-video analysis
          </Label>
          <Switch id="s3" />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="s4" className="text-sm text-text-secondary">
            Email on completion
          </Label>
          <Switch id="s4" />
        </div>
      </div>
    </div>
  ),
};
