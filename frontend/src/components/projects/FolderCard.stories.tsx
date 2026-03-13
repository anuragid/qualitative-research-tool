import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FolderCard from "./FolderCard";

const queryClient = new QueryClient();

const mockProject = {
  id: "1",
  created_by: "user1",
  name: "Daily Notes",
  description: "Research observations from field studies",
  status: "ready" as const,
  error_message: null,
  created_at: "2025-04-08T00:00:00Z",
  updated_at: "2025-04-08T00:00:00Z",
  videos: [{ id: "v1" }, { id: "v2" }] as any[],
};

const meta: Meta<typeof FolderCard> = {
  title: "Components/FolderCard",
  component: FolderCard,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <div className="p-8 bg-surface-page">
            <div className="grid grid-cols-3 gap-5 max-w-4xl">
              <Story />
            </div>
          </div>
        </MemoryRouter>
      </QueryClientProvider>
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
