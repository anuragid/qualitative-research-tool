import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FolderCard from "./FolderCard";
import { FOLDER_COLORS } from "../../lib/noise";
import type { Project } from "../../types";

// ---- Mocks ----

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockMutate = vi.fn();
vi.mock("../../hooks/useProjects", () => ({
  useUpdateProject: () => ({ mutate: mockMutate }),
}));

// Stub dialog components so they don't pull in heavy dependencies
vi.mock("./DeleteProjectDialog", () => ({
  DeleteProjectDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="delete-dialog">Delete dialog</div> : null,
}));
vi.mock("./EditProjectDialog", () => ({
  EditProjectDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edit-dialog">Edit dialog</div> : null,
}));

// ---- Helpers ----

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    name: "Usability Study Alpha",
    description: "A description of the project",
    created_by: "user-1",
    created_at: "2025-06-15T14:30:00Z",
    updated_at: "2025-06-16T10:00:00Z",
    status: "ready",
    ...overrides,
  };
}

function makeVideo(id: string, projectId = "proj-1") {
  return {
    id,
    project_id: projectId,
    filename: `${id}.mp4`,
    s3_key: `key-${id}`,
    s3_url: `url-${id}`,
    file_size_bytes: 1000,
    duration_seconds: 60,
    uploaded_at: "2025-06-15T00:00:00Z",
    status: "uploaded" as const,
    error_message: null,
  };
}

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderCard(project: Project, colorIndex = 0) {
  return render(
    <QueryClientProvider client={queryClient()}>
      <MemoryRouter>
        <FolderCard project={project} colorIndex={colorIndex} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Find the menu trigger button (the small icon button inside data-dropdown-menu). */
function getMenuTrigger(container: HTMLElement) {
  const dropdownWrapper = container.querySelector("[data-dropdown-menu]") as HTMLElement;
  return within(dropdownWrapper).getByRole("button");
}

// ---- Setup / Teardown ----

beforeEach(() => {
  mockNavigate.mockReset();
  mockMutate.mockReset();
});

afterEach(() => {
  cleanup();
});

// ---- Tests ----

describe("FolderCard", () => {
  // 1. Renders project name
  it("renders the project name", () => {
    renderCard(createProject({ name: "My Cool Project" }));
    expect(screen.getByText("My Cool Project")).toBeDefined();
  });

  // 2. Renders formatted date
  it("renders the created_at date formatted correctly", () => {
    renderCard(createProject({ created_at: "2025-06-15T14:30:00Z" }));
    // formatDate uses en-US with short month, numeric day, numeric year, 2-digit hour/minute
    expect(screen.getByText(/Jun 15, 2025/)).toBeDefined();
  });

  // 3. Renders video count when videos exist
  it("renders video count when the project has videos", () => {
    const project = createProject({
      videos: [makeVideo("v1"), makeVideo("v2")],
    });
    renderCard(project);
    expect(screen.getByText("2")).toBeDefined();
  });

  it("does not render video count when there are no videos", () => {
    renderCard(createProject({ videos: [] }));
    expect(screen.queryByText("0")).toBeNull();
  });

  // 4. Renders status indicator for non-planning statuses
  it.each(["ready", "processing", "completed", "archived"] as const)(
    'renders a badge for status "%s"',
    (status) => {
      renderCard(createProject({ status }));
      expect(screen.getByText(status)).toBeDefined();
    },
  );

  it('renders an error indicator for status "error"', () => {
    renderCard(createProject({ status: "error" }));
    expect(screen.getByText("Error")).toBeDefined();
  });

  it('does not render a status badge when status is "planning"', () => {
    renderCard(createProject({ status: "planning" }));
    expect(screen.queryByText("planning")).toBeNull();
  });

  // 5. Renders error message when status is "error"
  it("renders error message when status is error and error_message is set", () => {
    renderCard(
      createProject({
        status: "error",
        error_message: "Transcription failed unexpectedly",
      }),
    );
    expect(screen.getByText("Transcription failed unexpectedly")).toBeDefined();
  });

  it("does not render error box when status is error but no error_message", () => {
    const { container } = renderCard(
      createProject({ status: "error", error_message: null }),
    );
    // The error box has a specific class; it should not be present
    expect(container.querySelector(".border-l-2")).toBeNull();
  });

  // 6. Uses correct folder color based on colorIndex (0-5 cycling)
  it.each([0, 1, 2, 3, 4, 5])("applies folder color for colorIndex %i", (idx) => {
    const { container } = renderCard(createProject(), idx);
    const expectedColor = FOLDER_COLORS[idx % FOLDER_COLORS.length];

    // The folder tab div
    const tabDiv = container.querySelector(".rounded-t-sm") as HTMLElement;
    expect(tabDiv).not.toBeNull();
    expect(tabDiv.style.backgroundColor).toBe(expectedColor.tab);

    // The folder body div
    const bodyDiv = container.querySelector(".rounded-2xl") as HTMLElement;
    expect(bodyDiv).not.toBeNull();
    expect(bodyDiv.style.backgroundColor).toBe(expectedColor.body);
  });

  it("cycles colors for colorIndex >= 6", () => {
    const { container } = renderCard(createProject(), 7);
    const expectedColor = FOLDER_COLORS[7 % FOLDER_COLORS.length]; // index 1
    const tabDiv = container.querySelector(".rounded-t-sm") as HTMLElement;
    expect(tabDiv.style.backgroundColor).toBe(expectedColor.tab);
  });

  // 7. Menu button has responsive opacity classes (hidden on desktop, visible on hover)
  it("menu button has correct opacity classes for hover-reveal behavior", () => {
    const { container } = renderCard(createProject());
    const menuWrapper = container.querySelector("[data-dropdown-menu]") as HTMLElement;
    expect(menuWrapper).not.toBeNull();

    // Always visible on mobile (opacity-100), hidden on desktop (sm:opacity-0),
    // revealed on group hover (sm:group-hover:opacity-100)
    expect(menuWrapper.className).toContain("opacity-100");
    expect(menuWrapper.className).toContain("sm:opacity-0");
    expect(menuWrapper.className).toContain("sm:group-hover:opacity-100");
  });

  // 8. Navigates to /projects/:id on click
  it("navigates to the project page on click", () => {
    const { container } = renderCard(createProject({ id: "abc-123" }));
    const card = container.querySelector('[role="button"]') as HTMLElement;
    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith("/projects/abc-123");
  });

  // 9. Keyboard accessibility: Enter and Space trigger navigation
  it("navigates on Enter key press", () => {
    const { container } = renderCard(createProject({ id: "kb-1" }));
    const card = container.querySelector('[role="button"]') as HTMLElement;
    fireEvent.keyDown(card, { key: "Enter" });
    expect(mockNavigate).toHaveBeenCalledWith("/projects/kb-1");
  });

  it("navigates on Space key press", () => {
    const { container } = renderCard(createProject({ id: "kb-2" }));
    const card = container.querySelector('[role="button"]') as HTMLElement;
    fireEvent.keyDown(card, { key: " " });
    expect(mockNavigate).toHaveBeenCalledWith("/projects/kb-2");
  });

  // 10. Menu dropdown has Edit, Archive, Delete options
  it("shows Edit, Archive, and Delete in the dropdown menu", async () => {
    const user = userEvent.setup();
    const { container } = renderCard(createProject({ status: "ready" }));

    const menuTrigger = getMenuTrigger(container);
    await user.click(menuTrigger);

    expect(screen.getByText("Edit")).toBeDefined();
    expect(screen.getByText("Archive")).toBeDefined();
    expect(screen.getByText("Delete")).toBeDefined();
  });

  // 11. Archived project shows "Unarchive" instead of "Archive"
  it('shows "Unarchive" for archived projects', async () => {
    const user = userEvent.setup();
    const { container } = renderCard(createProject({ status: "archived" }));

    const menuTrigger = getMenuTrigger(container);
    await user.click(menuTrigger);

    expect(screen.getByText("Unarchive")).toBeDefined();
    expect(screen.queryByText("Archive")).toBeNull();
  });

  // 12. Has active:scale-[0.98] class for click feedback
  it("has active:scale-[0.98] class for click feedback", () => {
    const { container } = renderCard(createProject());
    const card = container.querySelector('[role="button"]') as HTMLElement;
    expect(card.className).toContain("active:scale-[0.98]");
  });

  // Additional: description rendering
  it("renders project description when provided", () => {
    renderCard(createProject({ description: "An important study" }));
    expect(screen.getByText("An important study")).toBeDefined();
  });

  it("does not render description paragraph when description is empty", () => {
    const { container } = renderCard(createProject({ description: "" }));
    // The description is rendered in a <p> with class text-sm; it should not exist
    expect(container.querySelector("p.text-sm")).toBeNull();
  });

  // Additional: archive toggle calls updateProject correctly
  it("calls updateProject to archive a non-archived project", async () => {
    const user = userEvent.setup();
    const { container } = renderCard(createProject({ id: "p-arch", status: "ready" }));

    const menuTrigger = getMenuTrigger(container);
    await user.click(menuTrigger);
    await user.click(screen.getByText("Archive"));

    expect(mockMutate).toHaveBeenCalledWith({
      id: "p-arch",
      data: { status: "archived" },
    });
  });

  it("calls updateProject to unarchive an archived project with videos", async () => {
    const user = userEvent.setup();
    const project = createProject({
      id: "p-unarch",
      status: "archived",
      videos: [makeVideo("v1", "p-unarch")],
    });
    const { container } = renderCard(project);

    const menuTrigger = getMenuTrigger(container);
    await user.click(menuTrigger);
    await user.click(screen.getByText("Unarchive"));

    expect(mockMutate).toHaveBeenCalledWith({
      id: "p-unarch",
      data: { status: "ready" },
    });
  });

  it("calls updateProject to unarchive an archived project without videos as planning", async () => {
    const user = userEvent.setup();
    const { container } = renderCard(
      createProject({ id: "p-novideos", status: "archived", videos: [] }),
    );

    const menuTrigger = getMenuTrigger(container);
    await user.click(menuTrigger);
    await user.click(screen.getByText("Unarchive"));

    expect(mockMutate).toHaveBeenCalledWith({
      id: "p-novideos",
      data: { status: "planning" },
    });
  });

  // Additional: card has role="button" and tabIndex for accessibility
  it('has role="button" and tabIndex=0 for accessibility', () => {
    const { container } = renderCard(createProject());
    const card = container.querySelector('[role="button"]') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.tabIndex).toBe(0);
  });

  // Additional: clicking dropdown area does not navigate
  it("does not navigate when clicking the dropdown menu area", async () => {
    const user = userEvent.setup();
    const { container } = renderCard(createProject({ id: "no-nav" }));

    const menuTrigger = getMenuTrigger(container);
    await user.click(menuTrigger);

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
