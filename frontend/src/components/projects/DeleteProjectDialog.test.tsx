import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DeleteProjectDialog } from "./DeleteProjectDialog";

// Mock hooks
const mockMutate = vi.fn();
let mockIsPending = false;

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../hooks/useProjects", () => ({
  useDeleteProject: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
  }),
}));

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const defaultProject = {
  id: "proj-1",
  name: "Test Project",
  videoCount: 3,
};

function renderDialog(props: Partial<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: typeof defaultProject;
  navigateAfterDelete: boolean;
}> = {}) {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    project: defaultProject,
    navigateAfterDelete: false,
    ...props,
  };
  const result = render(
    <QueryClientProvider client={queryClient()}>
      <MemoryRouter>
        <DeleteProjectDialog {...defaultProps} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, onOpenChange: defaultProps.onOpenChange };
}

/** Get the visible dialog content element to scope queries. */
function getDialogContent() {
  const dialogs = screen.getAllByRole("dialog");
  return dialogs[0];
}

describe("DeleteProjectDialog", () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockNavigate.mockReset();
    mockIsPending = false;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the dialog with project name when open", () => {
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Title contains "Delete Project" -- use heading role to disambiguate from button
    expect(scoped.getByRole("heading", { name: /delete project/i })).toBeDefined();
    expect(scoped.getByText(/Test Project/)).toBeDefined();
  });

  it("does not render dialog role when closed", () => {
    renderDialog({ open: false });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows file count and related items when videoCount > 0", () => {
    renderDialog({ project: { id: "p-1", name: "P", videoCount: 3 } });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("3 files")).toBeDefined();
    expect(scoped.getByText("All associated transcripts")).toBeDefined();
    expect(scoped.getByText("All analysis data")).toBeDefined();
  });

  it("shows singular 'file' when videoCount is 1", () => {
    renderDialog({ project: { id: "p-1", name: "P", videoCount: 1 } });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("1 file")).toBeDefined();
  });

  it("does not show video-related items when videoCount is 0", () => {
    renderDialog({ project: { id: "p-1", name: "P", videoCount: 0 } });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.queryByText(/\d+ video/)).toBeNull();
    expect(scoped.queryByText("All associated transcripts")).toBeNull();
  });

  it("does not show video-related items when videoCount is undefined", () => {
    renderDialog({ project: { id: "p-1", name: "P" } as typeof defaultProject });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.queryByText(/\d+ video/)).toBeNull();
  });

  it("calls deleteProject on confirm", async () => {
    mockMutate.mockImplementation((_id: string, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onOpenChange });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    await user.click(scoped.getByRole("button", { name: /delete project/i }));

    expect(mockMutate).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );

    // onSuccess should close dialog
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("navigates to /projects after delete when navigateAfterDelete is true", async () => {
    mockMutate.mockImplementation((_id: string, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    const user = userEvent.setup();
    renderDialog({ navigateAfterDelete: true });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    await user.click(scoped.getByRole("button", { name: /delete project/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/projects");
  });

  it("does not navigate after delete when navigateAfterDelete is false", async () => {
    mockMutate.mockImplementation((_id: string, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    const user = userEvent.setup();
    renderDialog({ navigateAfterDelete: false });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    await user.click(scoped.getByRole("button", { name: /delete project/i }));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("calls onError without crashing on error", async () => {
    mockMutate.mockImplementation((_id: string, options: { onError?: () => void }) => {
      options?.onError?.();
    });

    const user = userEvent.setup();
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Should not throw
    await user.click(scoped.getByRole("button", { name: /delete project/i }));

    expect(mockMutate).toHaveBeenCalled();
  });

  it("closes dialog when cancel is clicked", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onOpenChange });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    await user.click(scoped.getByRole("button", { name: /cancel/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows 'Deleting...' when isPending", () => {
    mockIsPending = true;
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("Deleting...")).toBeDefined();
  });

  it("disables buttons when isPending", () => {
    mockIsPending = true;
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    const cancelBtn = scoped.getByRole("button", { name: /cancel/i }) as HTMLButtonElement;
    expect(cancelBtn.disabled).toBe(true);

    // The delete button text is "Deleting..." when pending
    const deleteBtn = scoped.getByRole("button", { name: /delet/i }) as HTMLButtonElement;
    expect(deleteBtn.disabled).toBe(true);
  });
});
