import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "./Skeleton";

const meta = {
  title: "Primitives/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Skeleton className="h-4 w-[250px]" />,
};

export const Card: Story = {
  name: "Card Skeleton",
  render: () => (
    <div className="flex flex-col space-y-3">
      <Skeleton className="h-[125px] w-[250px] rounded-2xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
  ),
};

export const FolderCard: Story = {
  name: "Folder Card Skeleton",
  render: () => (
    <div className="rounded-2xl bg-card p-5 space-y-4 w-[350px]">
      <div className="space-y-2">
        <Skeleton className="h-5 w-[180px]" />
        <Skeleton className="h-4 w-[240px]" />
      </div>
      <Skeleton className="h-4 w-[120px]" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16 rounded-sm" />
        <Skeleton className="h-6 w-20 rounded-sm" />
      </div>
    </div>
  ),
};

export const TextBlock: Story = {
  name: "Text Block Skeleton",
  render: () => (
    <div className="space-y-2 w-[300px]">
      <Skeleton className="h-6 w-[200px]" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[240px]" />
    </div>
  ),
};
