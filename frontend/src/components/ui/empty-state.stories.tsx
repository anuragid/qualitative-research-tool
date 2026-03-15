import type { Meta, StoryObj } from "@storybook/react-vite";
import { Video, FolderOpen, Search, FileText, Upload } from "lucide-react";
import { EmptyState } from "./empty-state";
import { Button } from "./button";

const meta = {
  title: "Composites/EmptyState",
  component: EmptyState,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: FolderOpen,
    heading: "No items found",
    description: "There are no items to display. Create your first item to get started.",
  },
};

export const WithAction: Story = {
  args: {
    icon: Video,
    heading: "No videos yet",
    description:
      "Upload your first research video to begin analysis. We support MP4, MOV, and WebM formats.",
    action: (
      <Button>
        <Upload className="h-4 w-4" />
        Upload Video
      </Button>
    ),
  },
};

export const NoProjects: Story = {
  name: "No Projects",
  args: {
    icon: FolderOpen,
    heading: "No projects yet",
    description:
      "Create your first research project to start organizing and analyzing your qualitative data.",
    action: <Button>Create Project</Button>,
  },
};

export const NoSearchResults: Story = {
  name: "No Search Results",
  args: {
    icon: Search,
    heading: "No results found",
    description:
      "Try adjusting your search terms or filters to find what you're looking for.",
  },
};

export const NoTranscripts: Story = {
  name: "No Transcripts",
  args: {
    icon: FileText,
    heading: "No transcripts available",
    description:
      "Transcripts will appear here once your videos have been processed.",
  },
};
