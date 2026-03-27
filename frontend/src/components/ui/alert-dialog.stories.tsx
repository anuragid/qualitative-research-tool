import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent } from "storybook/test";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "./alert-dialog";
import { Button } from "./button";

const meta = {
  title: "Primitives/AlertDialog",
  component: AlertDialog,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof AlertDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Show Alert</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete your
            account and remove your data from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /show alert/i });
    await expect(trigger).toBeInTheDocument();
    await userEvent.click(trigger);

    const body = within(document.body);
    const dialog = await body.findByRole("alertdialog");
    await expect(dialog).toBeInTheDocument();
    await expect(within(dialog).getByText("Are you sure?")).toBeInTheDocument();
    await expect(
      within(dialog).getByText(/This action cannot be undone/)
    ).toBeInTheDocument();

    // Click Cancel to dismiss
    const cancelButton = within(dialog).getByRole("button", {
      name: /cancel/i,
    });
    await userEvent.click(cancelButton);
  },
};

export const Destructive: Story = {
  name: "Destructive Confirmation",
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete Project</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Project</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the project and all associated videos,
            transcriptions, and analysis data. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive">
            Delete Project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /delete project/i });
    await userEvent.click(trigger);

    const body = within(document.body);
    const dialog = await body.findByRole("alertdialog");
    await expect(dialog).toBeInTheDocument();

    // Verify the title is present
    const title = within(dialog).getByText("Delete Project", {
      selector: '[data-slot="alert-dialog-title"]',
    });
    await expect(title).toBeInTheDocument();

    // Click the destructive action to dismiss
    const actionButton = within(dialog).getByRole("button", {
      name: /delete project/i,
    });
    await userEvent.click(actionButton);
  },
};

export const Informational: Story = {
  name: "Informational Alert",
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="secondary">Start Analysis</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Start Analysis?</AlertDialogTitle>
          <AlertDialogDescription>
            This will begin processing all uploaded videos. Depending on the
            number of videos, this may take several minutes. You can continue
            using the app while analysis runs in the background.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not Now</AlertDialogCancel>
          <AlertDialogAction>Start</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /start analysis/i });
    await userEvent.click(trigger);

    const body = within(document.body);
    const dialog = await body.findByRole("alertdialog");
    await expect(
      within(dialog).getByText("Start Analysis?")
    ).toBeInTheDocument();

    // Click action to dismiss
    const actionButton = within(dialog).getByRole("button", {
      name: /start/i,
    });
    await userEvent.click(actionButton);
  },
};

export const CustomButtonSizes: Story = {
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Custom Sizes</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Custom Size Buttons</AlertDialogTitle>
          <AlertDialogDescription>
            This dialog demonstrates action and cancel buttons with custom size
            props.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" size="sm">
            Dismiss
          </AlertDialogCancel>
          <AlertDialogAction variant="default" size="sm">
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /custom sizes/i });
    await userEvent.click(trigger);

    const body = within(document.body);
    const dialog = await body.findByRole("alertdialog");
    await expect(dialog).toBeInTheDocument();

    const dismissBtn = within(dialog).getByRole("button", {
      name: /dismiss/i,
    });
    await userEvent.click(dismissBtn);
  },
};
