import type { Meta, StoryObj } from "@storybook/react-vite";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { Label } from "./label";

const meta = {
  title: "Primitives/RadioGroup",
  component: RadioGroup,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="option-1">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-1" id="option-1" />
        <Label htmlFor="option-1">Option One</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-2" id="option-2" />
        <Label htmlFor="option-2">Option Two</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-3" id="option-3" />
        <Label htmlFor="option-3">Option Three</Label>
      </div>
    </RadioGroup>
  ),
};

export const WithDescription: Story = {
  name: "With Descriptions",
  render: () => (
    <RadioGroup defaultValue="free">
      <div className="flex items-start space-x-2">
        <RadioGroupItem value="free" id="free" className="mt-1" />
        <div>
          <Label htmlFor="free">Free Model</Label>
          <p className="text-sm text-text-tertiary">
            Use OpenRouter free models (rate-limited)
          </p>
        </div>
      </div>
      <div className="flex items-start space-x-2">
        <RadioGroupItem value="byok" id="byok" className="mt-1" />
        <div>
          <Label htmlFor="byok">Bring Your Own Key</Label>
          <p className="text-sm text-text-tertiary">
            Use your own API key for faster processing
          </p>
        </div>
      </div>
    </RadioGroup>
  ),
};

export const Disabled: Story = {
  render: () => (
    <RadioGroup defaultValue="option-1" disabled>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-1" id="d-option-1" />
        <Label htmlFor="d-option-1">Selected (Disabled)</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-2" id="d-option-2" />
        <Label htmlFor="d-option-2">Unselected (Disabled)</Label>
      </div>
    </RadioGroup>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <RadioGroup defaultValue="grid" className="flex gap-4">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="grid" id="h-grid" />
        <Label htmlFor="h-grid">Grid</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="list" id="h-list" />
        <Label htmlFor="h-list">List</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="board" id="h-board" />
        <Label htmlFor="h-board">Board</Label>
      </div>
    </RadioGroup>
  ),
};
