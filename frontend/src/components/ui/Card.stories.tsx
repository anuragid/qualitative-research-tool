import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./Card";
import { Button } from "./Button";
import { Badge } from "./Badge";

const meta = {
  title: "Primitives/Card",
  component: Card,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
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
      <p>Simple card with just content — no resting shadow, rounded-2xl</p>
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
          <CardDescription>White card on warm cream background — no shadow needed</CardDescription>
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
