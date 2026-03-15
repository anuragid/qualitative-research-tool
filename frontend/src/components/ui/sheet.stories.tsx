import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Sheet, SheetTrigger, SheetContent, SheetHeader,
  SheetTitle, SheetDescription, SheetFooter, SheetClose,
} from "./sheet";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "Primitives/Sheet",
  component: Sheet,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile here. Click save when you're done.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Your name" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" placeholder="your@email.com" />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SheetClose>
          <Button>Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const LeftSide: Story = {
  name: "Left Side",
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Left</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>
            Browse your projects and settings.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-2 px-4">
          <Button variant="ghost" className="justify-start">Dashboard</Button>
          <Button variant="ghost" className="justify-start">Projects</Button>
          <Button variant="ghost" className="justify-start">Settings</Button>
        </div>
      </SheetContent>
    </Sheet>
  ),
};

export const TopSide: Story = {
  name: "Top Side",
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Top</Button>
      </SheetTrigger>
      <SheetContent side="top">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            You have 3 unread notifications.
          </SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
};

export const BottomSide: Story = {
  name: "Bottom Side",
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Bottom</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Quick Actions</SheetTitle>
          <SheetDescription>
            Select an action to perform on the current video.
          </SheetDescription>
        </SheetHeader>
        <div className="flex gap-2 px-4 pb-4">
          <Button variant="outline">Re-analyze</Button>
          <Button variant="outline">Export</Button>
          <Button variant="destructive">Delete</Button>
        </div>
      </SheetContent>
    </Sheet>
  ),
};

export const VideoDetails: Story = {
  name: "Video Details Panel",
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">View Video Details</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Interview #3 - User Testing</SheetTitle>
          <SheetDescription>
            Recorded on Jan 15, 2026. Duration: 45 minutes.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 py-2">
          <div className="grid gap-1">
            <span className="text-sm font-medium text-text-primary">Status</span>
            <span className="text-sm text-text-secondary">Transcribed</span>
          </div>
          <div className="grid gap-1">
            <span className="text-sm font-medium text-text-primary">Dimensions Analyzed</span>
            <span className="text-sm text-text-secondary">3 of 5 complete</span>
          </div>
          <div className="grid gap-1">
            <span className="text-sm font-medium text-text-primary">File Size</span>
            <span className="text-sm text-text-secondary">312 MB</span>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline">Re-analyze</Button>
          <Button>View Transcript</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
