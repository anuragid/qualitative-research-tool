import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent } from "storybook/test";
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter,
} from "./dialog";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import {
  DoExample,
  DontExample,
  DoAndDontGrid,
} from "../../stories/helpers/do-and-dont";

const meta = {
  title: "Primitives/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Modal dialog for focused tasks requiring user input.\n\n" +
          "**When to use:** Focused tasks like creating a project, uploading a video, or editing settings.\n\n" +
          "**When NOT to use:** Simple confirmations (use AlertDialog instead) or inline content.",
      },
    },
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open Dialog</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>Add a new research project to organize your videos.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Project Name</Label>
            <Input id="name" placeholder="User Study Q1" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="desc">Description</Label>
            <Input id="desc" placeholder="Optional description..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost">Cancel</Button>
          <Button type="submit">Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /open dialog/i });
    await expect(trigger).toBeInTheDocument();
    await userEvent.click(trigger);
    const dialog = await within(document.body).findByRole("dialog");
    await expect(dialog).toBeInTheDocument();
    await expect(within(dialog).getByText("Create Project")).toBeInTheDocument();
    const closeButton = within(dialog).getByRole("button", { name: /close/i });
    await userEvent.click(closeButton);
  },
};

export const Confirmation: Story = {
  name: "Confirmation Dialog",
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete Project</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the project and all associated data.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const DoAndDont: Story = {
  name: "Do / Don't",
  parameters: { layout: "padded" },
  render: () => (
    <DoAndDontGrid>
      <DoExample label="Use for focused tasks (create project, upload video)">
        <p className="text-sm text-text-secondary">
          Dialogs are ideal for forms that require user focus and shouldn't be
          interrupted by other page content.
        </p>
      </DoExample>
      <DontExample label="Use for simple confirmations (use AlertDialog instead)">
        <p className="text-sm text-text-secondary">
          A simple "Are you sure?" prompt should use AlertDialog, which
          prevents accidental dismissal by clicking outside.
        </p>
      </DontExample>
    </DoAndDontGrid>
  ),
};
