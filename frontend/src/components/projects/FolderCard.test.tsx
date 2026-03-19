import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FolderCard from "./FolderCard";
import { FOLDER_COLORS, getFolderColor } from "../../lib/noise";
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

  // 2. Renders video count text when videos exist
  it("renders video count when the project has videos", () => {
    const project = createProject({
      videos: [makeVideo("v1"), makeVideo("v2")],
    });
    renderCard(project);
    expect(screen.getByText("2 videos")).toBeDefined();
  });

  it("renders singular 'video' for one video", () => {
    const project = createProject({
      videos: [makeVideo("v1")],
    });
    renderCard(project);
    expect(screen.getByText("1 video")).toBeDefined();
  });

  it('renders "No videos" when there are no videos', () => {
    renderCard(createProject({ videos: [] }));
    expect(screen.getByText("No videos")).toBeDefined();
  });

  // 3. Renders FolderStatusIcon for various statuses
  it("renders a folder-status-icon for each status", () => {
    const { container } = renderCard(createProject({ status: "completed" }));
    expect(container.querySelector(".folder-status-icon")).not.toBeNull();
  });

  it("renders a folder-status-icon for error status", () => {
    const { container } = renderCard(createProject({ status: "error" }));
    expect(container.querySelector(".folder-status-icon")).not.toBeNull();
  });

  it("renders a folder-status-icon for planning status", () => {
    const { container } = renderCard(createProject({ status: "planning" }));
    expect(container.querySelector(".folder-status-icon")).not.toBeNull();
  });

  // 4. Uses correct folder color based on colorIndex (CSS variables)
  it.each([0, 1, 2, 3, 4, 5])("applies folder color for colorIndex %i", (idx) => {
    const { container } = renderCard(createProject(), idx);
    const expectedColor = getFolderColor(idx);

    // The back panel div has the tab color as backgroundColor
    const backPanel = container.querySelector(".noise-texture") as HTMLElement;
    expect(backPanel).not.toBeNull();
    expect(backPanel.style.backgroundColor).toBe(expectedColor.tab);

    // The front panel SVG path has the body color as fill
    const svgPath = container.querySelector("path") as SVGPathElement;
    expect(svgPath).not.toBeNull();
    expect(svgPath.getAttribute("fill")).toBe(expectedColor.body);
  });

  it("cycles colors for colorIndex >= 6", () => {
    const { container } = renderCard(createProject(), 7);
    const expectedColor = FOLDER_COLORS[7 % FOLDER_COLORS.length];
    const backPanel = container.querySelector(".noise-texture") as HTMLElement;
    expect(backPanel.style.backgroundColor).toBe(expectedColor.tab);
  });

  // 5. Menu button has responsive opacity classes (hidden on desktop, visible on hover)
  it("menu button has correct opacity classes for hover-reveal behavior", () => {
    const { container } = renderCard(createProject());
    const menuWrapper = container.querySelector("[data-dropdown-menu]") as HTMLElement;
    expect(menuWrapper).not.toBeNull();

    expect(menuWrapper.className).toContain("opacity-100");
    expect(menuWrapper.className).toContain("sm:opacity-0");
    expect(menuWrapper.className).toContain("sm:group-hover/folder:opacity-100");
  });

  // 6. Navigates to /projects/:id on click
  it("navigates to the project page on click", () => {
    const { container } = renderCard(createProject({ id: "abc-123" }));
    const card = container.querySelector('[role="button"]') as HTMLElement;
    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith("/projects/abc-123");
  });

  // 7. Keyboard accessibility: Enter and Space trigger navigation
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

  // 8. Menu dropdown has Edit, Archive, Delete options
  it("shows Edit, Archive, and Delete in the dropdown menu", async () => {
    const user = userEvent.setup();
    const { container } = renderCard(createProject({ status: "ready" }));

    const menuTrigger = getMenuTrigger(container);
    await user.click(menuTrigger);

    expect(screen.getByText("Edit")).toBeDefined();
    expect(screen.getByText("Archive")).toBeDefined();
    expect(screen.getByText("Delete")).toBeDefined();
  });

  // 9. Archived project shows "Unarchive" instead of "Archive"
  it('shows "Unarchive" for archived projects', async () => {
    const user = userEvent.setup();
    const { container } = renderCard(createProject({ status: "archived" }));

    const menuTrigger = getMenuTrigger(container);
    await user.click(menuTrigger);

    expect(screen.getByText("Unarchive")).toBeDefined();
    expect(screen.queryByText("Archive")).toBeNull();
  });

  // 10. Card has click feedback via inner div
  it("has group-active scale class for click feedback", () => {
    const { container } = renderCard(createProject());
    const card = container.querySelector('[role="button"]') as HTMLElement;
    // The scale effect is on the inner hover-outline div, accessed via group-active
    const innerDiv = card.querySelector("div") as HTMLElement;
    expect(innerDiv).not.toBeNull();
    expect(innerDiv.className).toContain("group-active/folder:scale-[0.98]");
  });

  // 11. Archive toggle calls updateProject correctly
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

  // 12. Card has role="button" and tabIndex for accessibility
  it('has role="button" and tabIndex=0 for accessibility', () => {
    const { container } = renderCard(createProject());
    const card = container.querySelector('[role="button"]') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.tabIndex).toBe(0);
  });

  // 13. Clicking dropdown area does not navigate
  it("does not navigate when clicking the dropdown menu area", async () => {
    const user = userEvent.setup();
    const { container } = renderCard(createProject({ id: "no-nav" }));

    const menuTrigger = getMenuTrigger(container);
    await user.click(menuTrigger);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // 14. Clicking "Edit" in dropdown opens the edit dialog
  it("opens the edit dialog when Edit is clicked from dropdown", async () => {
    const user = userEvent.setup();
    const { container } = renderCard(createProject({ id: "edit-test" }));

    const menuTrigger = getMenuTrigger(container);
    await user.click(menuTrigger);
    await user.click(screen.getByText("Edit"));

    expect(screen.getByTestId("edit-dialog")).toBeDefined();
  });

  // 15. Clicking "Delete" in dropdown opens the delete dialog
  it("opens the delete dialog when Delete is clicked from dropdown", async () => {
    const user = userEvent.setup();
    const { container } = renderCard(createProject({ id: "delete-test" }));

    const menuTrigger = getMenuTrigger(container);
    await user.click(menuTrigger);
    await user.click(screen.getByText("Delete"));

    expect(screen.getByTestId("delete-dialog")).toBeDefined();
  });

  // 16. Clicking Edit does not navigate
  it("clicking Edit in dropdown does not navigate", async () => {
    const user = userEvent.setup();
    const { container } = renderCard(createProject({ id: "no-nav-edit" }));

    const menuTrigger = getMenuTrigger(container);
    await user.click(menuTrigger);
    await user.click(screen.getByText("Edit"));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // 17. Clicking Delete does not navigate
  it("clicking Delete in dropdown does not navigate", async () => {
    const user = userEvent.setup();
    const { container } = renderCard(createProject({ id: "no-nav-del" }));

    const menuTrigger = getMenuTrigger(container);
    await user.click(menuTrigger);
    await user.click(screen.getByText("Delete"));

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
