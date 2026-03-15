import type { Meta, StoryObj } from "@storybook/react-vite";
import { Clock, HardDrive, Calendar, Users, Video, FileText } from "lucide-react";
import { MetadataRow } from "./metadata-row";

const meta = {
  title: "Composites/MetadataRow",
  component: MetadataRow,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof MetadataRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: [
      { value: "1.2 GB" },
      { value: "12:34" },
      { value: "Mar 15, 2026" },
    ],
  },
};

export const WithIcons: Story = {
  name: "With Icons",
  args: {
    items: [
      { icon: HardDrive, value: "1.2 GB" },
      { icon: Clock, value: "12:34" },
      { icon: Calendar, value: "Mar 15, 2026" },
    ],
  },
};

export const WithLabels: Story = {
  name: "With Labels",
  args: {
    items: [
      { label: "Size", value: "1.2 GB" },
      { label: "Duration", value: "12:34" },
      { label: "Uploaded", value: "Mar 15, 2026" },
    ],
  },
};

export const WithIconsAndLabels: Story = {
  name: "With Icons and Labels",
  args: {
    items: [
      { icon: HardDrive, label: "Size", value: "1.2 GB" },
      { icon: Clock, label: "Duration", value: "12:34" },
      { icon: Calendar, label: "Date", value: "Mar 15, 2026" },
    ],
  },
};

export const PipeSeparator: Story = {
  name: "Pipe Separator",
  args: {
    items: [
      { value: "1.2 GB" },
      { value: "12:34" },
      { value: "Mar 15, 2026" },
    ],
    separator: "|",
  },
};

export const ProjectMetadata: Story = {
  name: "Project Metadata",
  args: {
    items: [
      { icon: Video, value: "8 videos" },
      { icon: Users, value: "3 participants" },
      { icon: Calendar, value: "Created Feb 28, 2026" },
    ],
  },
};

export const AnalysisSummary: Story = {
  name: "Analysis Summary",
  args: {
    items: [
      { icon: FileText, value: "5 themes identified" },
      { value: "23 codes" },
      { value: "142 excerpts" },
    ],
  },
};

export const SingleItem: Story = {
  name: "Single Item",
  args: {
    items: [{ icon: Clock, value: "Last updated 2 hours ago" }],
  },
};
