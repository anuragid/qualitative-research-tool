import type { Meta, StoryObj } from "@storybook/react-vite";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "./hover-card";
import { Avatar, AvatarFallback } from "./avatar";
import { Button } from "./button";
import { CalendarDays } from "lucide-react";

const meta = {
  title: "Primitives/HoverCard",
  component: HoverCard,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof HoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button variant="link" className="text-base">@researcher</Button>
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="flex gap-4">
          <Avatar>
            <AvatarFallback>RS</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-text-primary">@researcher</h4>
            <p className="text-sm text-text-secondary">
              Qualitative research analyst working on user experience studies.
            </p>
            <div className="flex items-center pt-2">
              <CalendarDays className="mr-2 size-4 text-text-tertiary" />
              <span className="text-xs text-text-tertiary">
                Joined January 2026
              </span>
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
};

export const VideoPreview: Story = {
  name: "Video Preview Card",
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button variant="link" className="text-base">Interview #3</Button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="space-y-2">
          <div className="h-32 w-full rounded-lg bg-interactive-fill flex items-center justify-center">
            <span className="text-text-placeholder text-sm">Video Thumbnail</span>
          </div>
          <h4 className="text-sm font-semibold text-text-primary">User Testing Interview #3</h4>
          <p className="text-sm text-text-secondary">
            Duration: 45 min | 3/5 dimensions analyzed
          </p>
          <div className="flex gap-2 pt-1">
            <span className="rounded-sm bg-interactive-fill px-2 py-0.5 text-xs text-text-secondary">Transcribed</span>
            <span className="rounded-sm bg-interactive-fill px-2 py-0.5 text-xs text-text-secondary">In Progress</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
};

export const ProjectInfo: Story = {
  name: "Project Info Hover",
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span className="cursor-pointer border-b border-dashed border-text-placeholder text-sm text-text-primary">
          UX Research Q1
        </span>
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-text-primary">UX Research Q1</h4>
          <p className="text-sm text-text-secondary">
            First quarter user experience research project with 11 participant interviews.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-text-tertiary">
            <span>Videos: 11</span>
            <span>Status: Active</span>
            <span>Created: Jan 2026</span>
            <span>Owner: Dr. Johnson</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
};
