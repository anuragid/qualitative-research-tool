import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from "./card";
import { Button } from "./button";
import { Badge } from "./badge";
import {
  DoExample,
  DontExample,
  DoAndDontGrid,
} from "../../stories/helpers/do-and-dont";

const meta = {
  title: "Primitives/Card",
  component: Card,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Content container for grouping related information.\n\n" +
          "**When to use:** Grouping related content such as project info, analysis results, or settings sections.\n\n" +
          "**When NOT to use:** Page-level layout or full-width sections (use standard layout containers instead).",
      },
    },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Research Project</CardTitle>
        <CardDescription>Qualitative analysis of user interviews</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-tertiary">3 videos uploaded, 2 analyzed</p>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="ghost">Cancel</Button>
        <Button>Continue</Button>
      </CardFooter>
    </Card>
  ),
};

export const Simple: Story = {
  render: () => (
    <Card className="w-[350px] p-5">
      <p>Simple card with just content -- no resting shadow, rounded-2xl</p>
    </Card>
  ),
};

export const WithBadge: Story = {
  name: "With Status Badge",
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>User Study Q1</CardTitle>
          <Badge variant="success">Completed</Badge>
        </div>
        <CardDescription>Analysis of 5 participant interviews</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-secondary">5 videos, all analyzed</p>
      </CardContent>
    </Card>
  ),
};

export const OnWarmBackground: Story = {
  name: "On Warm Background (no shadow needed)",
  render: () => (
    <div className="bg-surface-page p-8 rounded-2xl">
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Flat on cream</CardTitle>
          <CardDescription>White card on warm cream background -- no shadow needed</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-tertiary">The contrast provides visual separation.</p>
        </CardContent>
      </Card>
    </div>
  ),
};

export const ElevatedWithShadow: Story = {
  name: "Elevated (shadow-card)",
  render: () => (
    <Card className="w-[350px] shadow-card">
      <CardHeader>
        <CardTitle>Elevated Card</CardTitle>
        <CardDescription>Uses shadow-card for white-on-white contexts</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-tertiary">Multi-layer shadow for depth.</p>
      </CardContent>
    </Card>
  ),
};

export const WithAction: Story = {
  name: "With Card Action",
  render: () => (
    <Card className="w-[350px]">
      <CardHeader className="grid grid-cols-[1fr_auto] items-start gap-4">
        <div>
          <CardTitle>User Study Q1</CardTitle>
          <CardDescription>5 videos, 3 analyzed</CardDescription>
        </div>
        <CardAction>
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-tertiary">Analysis in progress...</p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm">
          View Details
        </Button>
      </CardFooter>
    </Card>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const action = canvasElement.querySelector('[data-slot="card-action"]');
    await expect(action).toBeInTheDocument();
    await expect(canvas.getByText("Edit")).toBeInTheDocument();
  },
};

export const DoAndDont: Story = {
  name: "Do / Don't",
  parameters: { layout: "padded" },
  render: () => (
    <DoAndDontGrid>
      <DoExample label="Use for grouping related content">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Project Info</CardTitle>
            <CardDescription>5 videos, 3 analyzed</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-tertiary">Analysis results grouped together</p>
          </CardContent>
        </Card>
      </DoExample>
      <DontExample label="Nest cards more than one level deep">
        <Card className="w-full p-3">
          <p className="text-sm mb-2">Outer card</p>
          <Card className="p-3">
            <p className="text-sm mb-2">Inner card</p>
            <Card className="p-3">
              <p className="text-sm">Too deep!</p>
            </Card>
          </Card>
        </Card>
      </DontExample>
    </DoAndDontGrid>
  ),
};
