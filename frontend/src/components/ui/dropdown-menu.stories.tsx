import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent } from "storybook/test";
import {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "./dropdown-menu";
import { Button } from "./button";
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Archive,
  Download,
  User,
  CreditCard,
  Settings,
  Mail,
  MessageSquare,
  PlusCircle,
  Plus,
  Cloud,
  LifeBuoy,
  LogOut,
} from "lucide-react";

const meta = {
  title: "Primitives/DropdownMenu",
  component: DropdownMenu,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Options</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Edit className="mr-2 size-4" /> Edit Project
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Download className="mr-2 size-4" /> Export Analysis
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Archive className="mr-2 size-4" /> Archive
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive">
          <Trash2 className="mr-2 size-4" /> Delete Project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /options/i });
    await userEvent.click(trigger);

    const body = within(document.body);
    const menu = await body.findByRole("menu");
    await expect(menu).toBeInTheDocument();
    await expect(within(menu).getByText("Actions")).toBeInTheDocument();
    await expect(within(menu).getByText("Edit Project")).toBeInTheDocument();

    // Dismiss by pressing Escape
    await userEvent.keyboard("{Escape}");
  },
};

export const IconTrigger: Story = {
  name: "Icon Trigger (folder card menu)",
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>
          <Edit className="mr-2 size-4" /> Edit
          <DropdownMenuShortcut>E</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Archive className="mr-2 size-4" /> Archive
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive">
          <Trash2 className="mr-2 size-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button");
    await userEvent.click(trigger);

    const body = within(document.body);
    const menu = await body.findByRole("menu");
    await expect(menu).toBeInTheDocument();

    // Verify shortcut is rendered
    await expect(within(menu).getByText("E")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
  },
};

function CheckboxMenuExample() {
  const [showStatusBar, setShowStatusBar] = React.useState(true);
  const [showActivityBar, setShowActivityBar] = React.useState(false);
  const [showPanel, setShowPanel] = React.useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">View Options</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={showStatusBar}
          onCheckedChange={setShowStatusBar}
        >
          Status Bar
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={showActivityBar}
          onCheckedChange={setShowActivityBar}
        >
          Activity Bar
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={showPanel}
          onCheckedChange={setShowPanel}
        >
          Panel
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const WithCheckboxItems: Story = {
  name: "Checkbox Items",
  render: () => <CheckboxMenuExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /view options/i });
    await userEvent.click(trigger);

    const body = within(document.body);
    const menu = await body.findByRole("menu");
    await expect(menu).toBeInTheDocument();

    // Find checkbox items
    const statusBarItem = within(menu).getByRole("menuitemcheckbox", {
      name: /status bar/i,
    });
    await expect(statusBarItem).toBeInTheDocument();
    await expect(statusBarItem).toHaveAttribute("data-state", "checked");

    // Toggle an unchecked item
    const activityBarItem = within(menu).getByRole("menuitemcheckbox", {
      name: /activity bar/i,
    });
    await expect(activityBarItem).toHaveAttribute("data-state", "unchecked");
    await userEvent.click(activityBarItem);

    await userEvent.keyboard("{Escape}");
  },
};

function RadioMenuExample() {
  const [position, setPosition] = React.useState("bottom");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Panel Position</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Panel Position</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={position} onValueChange={setPosition}>
          <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="bottom">Bottom</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="right">Right</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const WithRadioItems: Story = {
  name: "Radio Items",
  render: () => <RadioMenuExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /panel position/i });
    await userEvent.click(trigger);

    const body = within(document.body);
    const menu = await body.findByRole("menu");
    await expect(menu).toBeInTheDocument();

    // Check default radio selection
    const bottomItem = within(menu).getByRole("menuitemradio", {
      name: /bottom/i,
    });
    await expect(bottomItem).toHaveAttribute("data-state", "checked");

    // Select a different radio option
    const topItem = within(menu).getByRole("menuitemradio", { name: /top/i });
    await userEvent.click(topItem);

    await userEvent.keyboard("{Escape}");
  },
};

export const WithSubMenu: Story = {
  name: "Sub Menu",
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Account</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <User className="mr-2 size-4" />
            Profile
            <DropdownMenuShortcut>P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CreditCard className="mr-2 size-4" />
            Billing
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings className="mr-2 size-4" />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Plus className="mr-2 size-4" />
              Invite users
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem>
                  <Mail className="mr-2 size-4" />
                  Email
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <MessageSquare className="mr-2 size-4" />
                  Message
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <PlusCircle className="mr-2 size-4" />
                  More...
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LifeBuoy className="mr-2 size-4" />
          Support
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Cloud className="mr-2 size-4" />
          API
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LogOut className="mr-2 size-4" />
          Log out
          <DropdownMenuShortcut>Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /account/i });
    await userEvent.click(trigger);

    const body = within(document.body);
    const menu = await body.findByRole("menu");
    await expect(menu).toBeInTheDocument();
    await expect(within(menu).getByText("My Account")).toBeInTheDocument();
    await expect(within(menu).getByText("Profile")).toBeInTheDocument();
    await expect(within(menu).getByText("Q")).toBeInTheDocument();

    // Hover over sub-menu trigger to open submenu
    const subTrigger = within(menu).getByText("Invite users");
    await userEvent.hover(subTrigger);

    // Wait for submenu content
    const emailItem = await body.findByText("Email");
    await expect(emailItem).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
  },
};

export const InsetLabel: Story = {
  name: "Inset Items and Label",
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Inset Example</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel inset>Inset Label</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem inset>Profile</DropdownMenuItem>
        <DropdownMenuItem inset>Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger inset>More Tools</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Save Page As...</DropdownMenuItem>
            <DropdownMenuItem>Create Shortcut...</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /inset example/i });
    await userEvent.click(trigger);

    const body = within(document.body);
    const menu = await body.findByRole("menu");
    await expect(within(menu).getByText("Inset Label")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
  },
};
