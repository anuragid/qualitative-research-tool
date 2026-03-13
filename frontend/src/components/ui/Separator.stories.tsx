import type { Meta, StoryObj } from "@storybook/react-vite";
import { Separator } from "./Separator";

const meta = {
  title: "UI/Separator",
  component: Separator,
  tags: ["autodocs"],
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-[300px]">
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">Methodex</h4>
        <p className="text-sm text-muted-foreground">Qualitative research analysis tool</p>
      </div>
      <Separator className="my-4" />
      <div className="flex h-5 items-center space-x-4 text-sm">
        <div>Projects</div>
        <Separator orientation="vertical" />
        <div>Videos</div>
        <Separator orientation="vertical" />
        <div>Analysis</div>
      </div>
    </div>
  ),
};
