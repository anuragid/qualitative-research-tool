import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Select, SelectTrigger, SelectValue, SelectContent,
  SelectGroup, SelectLabel, SelectItem,
} from "./Select";
import { Label } from "./Label";

const meta = {
  title: "Primitives/Select",
  component: Select,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Select a model..." />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Free Models</SelectLabel>
          <SelectItem value="gemma">Gemma 2 9B</SelectItem>
          <SelectItem value="llama">Llama 3.1 8B</SelectItem>
          <SelectItem value="mistral">Mistral 7B</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Premium (BYOK)</SelectLabel>
          <SelectItem value="claude">Claude Sonnet</SelectItem>
          <SelectItem value="gpt4">GPT-4o</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1">
      <Label htmlFor="model-select">AI Model</Label>
      <Select>
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Choose model..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="gemma">Gemma 2 9B</SelectItem>
          <SelectItem value="llama">Llama 3.1 8B</SelectItem>
          <SelectItem value="claude">Claude Sonnet</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};
