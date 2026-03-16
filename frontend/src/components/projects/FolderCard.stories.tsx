import type { Meta, StoryObj } from "@storybook/react-vite";
import FolderCard from "./FolderCard";
import type { Video } from "../../types";

/** Helper to create a mock Video with sensible defaults */
const mockVideo = (overrides: Partial<Video> = {}): Video => ({
  id: `v-${Math.random().toString(36).slice(2, 8)}`,
  project_id: "1",
  filename: "interview.mp4",
  s3_key: "videos/interview.mp4",
  s3_url: "https://example.com/interview.mp4",
  file_size_bytes: 50_000_000,
  duration_seconds: 1800,
  uploaded_at: "2025-04-08T00:00:00Z",
  status: "uploaded",
  error_message: null,
  ...overrides,
} as Video);

const mockProject = {
  id: "1",
  created_by: "user1",
  name: "Daily Notes",
  description: "Research observations from field studies",
  status: "ready" as const,
  error_message: null,
  created_at: "2025-04-08T00:00:00Z",
  updated_at: "2025-04-08T00:00:00Z",
  videos: [{ id: "v1" }, { id: "v2" }] as unknown as Video[],
};

const meta: Meta<typeof FolderCard> = {
  title: "Features/FolderCard",
  component: FolderCard,
  decorators: [
    (Story) => (
      <div className="p-8 bg-surface-page">
        <div className="grid grid-cols-3 gap-5 max-w-4xl">
          <Story />
        </div>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof FolderCard>;

export const Default: Story = {
  args: { project: mockProject, colorIndex: 0 },
};

export const AllColors: Story = {
  render: () => (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <FolderCard
          key={i}
          project={{ ...mockProject, id: String(i), name: ["Daily Notes", "Journal", "Milestones", "Music", "Wellness Tracker", "Client Notes"][i] }}
          colorIndex={i}
        />
      ))}
    </>
  ),
};

export const ErrorState: Story = {
  args: {
    project: { ...mockProject, status: "error" as const, error_message: "Analysis pipeline failed at step 3" },
    colorIndex: 3,
  },
};

export const Archived: Story = {
  args: {
    project: { ...mockProject, status: "archived" as const },
    colorIndex: 2,
  },
};

/** Planning state with no videos — shows + icon and "No videos" label */
export const PlanningEmpty: Story = {
  args: {
    project: {
      ...mockProject,
      name: "New Research Project",
      status: "planning" as const,
      videos: [],
    },
    colorIndex: 1,
  },
};

/** Ready state with 3 videos — shows play icon and thumbnail fan */
export const ReadyWithVideos: Story = {
  args: {
    project: {
      ...mockProject,
      name: "Field Study Alpha",
      status: "ready" as const,
      videos: [
        mockVideo({ id: "v1", filename: "interview-1.mp4" }),
        mockVideo({ id: "v2", filename: "interview-2.mp4" }),
        mockVideo({ id: "v3", filename: "interview-3.mp4" }),
      ],
    },
    colorIndex: 0,
  },
};

/** Processing — Transcribing phase: at least one video has status "transcribing" */
export const ProcessingTranscribing: Story = {
  args: {
    project: {
      ...mockProject,
      name: "Transcribing Audio",
      status: "processing" as const,
      videos: [
        mockVideo({ id: "v1", status: "transcribing" }),
        mockVideo({ id: "v2", status: "uploaded" }),
      ],
    },
    colorIndex: 4,
  },
};

/** Processing — Analyzing phase: at least one video has status "analyzing" */
export const ProcessingAnalyzing: Story = {
  args: {
    project: {
      ...mockProject,
      name: "Analyzing Themes",
      status: "processing" as const,
      videos: [
        mockVideo({ id: "v1", status: "analyzing" }),
        mockVideo({ id: "v2", status: "transcribed" }),
      ],
    },
    colorIndex: 5,
  },
};

/** Processing — Synthesizing phase: all videos have status "analyzed" with 2+ videos */
export const ProcessingSynthesizing: Story = {
  args: {
    project: {
      ...mockProject,
      name: "Cross-Video Synthesis",
      status: "processing" as const,
      videos: [
        mockVideo({ id: "v1", status: "analyzed" }),
        mockVideo({ id: "v2", status: "analyzed" }),
        mockVideo({ id: "v3", status: "analyzed" }),
      ],
    },
    colorIndex: 2,
  },
};

/** Completed state — shows green checkmark with bounce-in animation */
export const Completed: Story = {
  args: {
    project: {
      ...mockProject,
      name: "Finished Analysis",
      status: "completed" as const,
      videos: [
        mockVideo({ id: "v1", status: "analyzed" }),
        mockVideo({ id: "v2", status: "analyzed" }),
      ],
    },
    colorIndex: 3,
  },
};

/** Side-by-side comparison of 0, 1, 2, and 3 video thumbnail counts */
export const ThumbnailCounts: Story = {
  render: () => (
    <>
      <FolderCard
        project={{
          ...mockProject,
          id: "tc-0",
          name: "No Videos",
          status: "planning" as const,
          videos: [],
        }}
        colorIndex={0}
      />
      <FolderCard
        project={{
          ...mockProject,
          id: "tc-1",
          name: "One Video",
          videos: [mockVideo({ id: "v1" })],
        }}
        colorIndex={1}
      />
      <FolderCard
        project={{
          ...mockProject,
          id: "tc-2",
          name: "Two Videos",
          videos: [
            mockVideo({ id: "v1" }),
            mockVideo({ id: "v2" }),
          ],
        }}
        colorIndex={2}
      />
      <FolderCard
        project={{
          ...mockProject,
          id: "tc-3",
          name: "Three Videos",
          videos: [
            mockVideo({ id: "v1" }),
            mockVideo({ id: "v2" }),
            mockVideo({ id: "v3" }),
          ],
        }}
        colorIndex={3}
      />
    </>
  ),
};
