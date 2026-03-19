import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditProjectDialog } from "./EditProjectDialog";

// Mock useUpdateProject hook
const mockMutate = vi.fn();
let mockIsPending = false;
let mockError: Error | null = null;

vi.mock("../../hooks/useProjects", () => ({
  useUpdateProject: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
    error: mockError,
  }),
}));

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const defaultProject = {
  id: "proj-1",
  name: "Test Project",
  description: "A test description",
  status: "ready",
};

function renderDialog(props: Partial<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: typeof defaultProject;
}> = {}) {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    project: defaultProject,
    ...props,
  };
  const result = render(
    <QueryClientProvider client={queryClient()}>
      <EditProjectDialog {...defaultProps} />
    </QueryClientProvider>,
  );
  return { ...result, onOpenChange: defaultProps.onOpenChange };
}

/** Get the visible dialog content element to scope queries. */
function getDialogContent() {
  const dialogs = screen.getAllByRole("dialog");
  return dialogs[0];
}

describe("EditProjectDialog", () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockIsPending = false;
    mockError = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the dialog with project data when open", () => {
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("Edit Project")).toBeDefined();
    expect(scoped.getByDisplayValue("Test Project")).toBeDefined();
    expect(scoped.getByDisplayValue("A test description")).toBeDefined();
  });

  it("does not render dialog role when closed", () => {
    renderDialog({ open: false });

    // When closed, Radix does not mount dialog at all
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("submits form with updated data and calls onSuccess", async () => {
    // Make mutate call the onSuccess callback
    mockMutate.mockImplementation((_data: unknown, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onOpenChange });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    const nameInput = scoped.getByDisplayValue("Test Project");
    await user.clear(nameInput);
    await user.type(nameInput, "Updated Name");

    const descInput = scoped.getByDisplayValue("A test description");
    await user.clear(descInput);
    await user.type(descInput, "Updated description");

    await user.click(scoped.getByRole("button", { name: /save changes/i }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        id: "proj-1",
        data: {
          name: "Updated Name",
          description: "Updated description",
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );

    // onSuccess should close dialog
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not submit when name is empty or whitespace", async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    const nameInput = scoped.getByDisplayValue("Test Project");
    await user.clear(nameInput);

    // The submit button is disabled when !name.trim()
    const submitBtn = scoped.getByRole("button", { name: /save changes/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("calls onError callback when mutation fails", async () => {
    // Make mutate call the onError callback
    mockMutate.mockImplementation((_data: unknown, options: { onError?: () => void }) => {
      options?.onError?.();
    });

    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onOpenChange });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    await user.click(scoped.getByRole("button", { name: /save changes/i }));

    expect(mockMutate).toHaveBeenCalled();
    // onOpenChange should NOT have been called with false (dialog stays open on error)
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("shows error message when mutationError is set", () => {
    mockError = new Error("Something went wrong");
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);
    expect(scoped.getByText("Failed to save. Please try again.")).toBeDefined();
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

  it("shows 'Saving...' and loader when isPending", () => {
    mockIsPending = true;
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);
    expect(scoped.getByText("Saving...")).toBeDefined();
  });

  it("disables inputs when isPending", () => {
    mockIsPending = true;
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    const nameInput = scoped.getByDisplayValue("Test Project") as HTMLInputElement;
    const descInput = scoped.getByDisplayValue("A test description") as HTMLTextAreaElement;

    expect(nameInput.disabled).toBe(true);
    expect(descInput.disabled).toBe(true);
  });

  it("resets form when dialog opens with new project data", () => {
    const { rerender } = render(
      <QueryClientProvider client={queryClient()}>
        <EditProjectDialog
          open={false}
          onOpenChange={vi.fn()}
          project={{ id: "p-1", name: "Old Name", description: "Old Desc", status: "ready" }}
        />
      </QueryClientProvider>,
    );

    // Reopen with new project data
    rerender(
      <QueryClientProvider client={queryClient()}>
        <EditProjectDialog
          open={true}
          onOpenChange={vi.fn()}
          project={{ id: "p-2", name: "New Name", description: "New Desc", status: "ready" }}
        />
      </QueryClientProvider>,
    );

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByDisplayValue("New Name")).toBeDefined();
    expect(scoped.getByDisplayValue("New Desc")).toBeDefined();
  });

  it("handles null description in project", () => {
    renderDialog({
      project: { id: "p-3", name: "No Desc", description: null as unknown as string, status: "ready" },
    });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Description should default to empty string
    const descInput = scoped.getByPlaceholderText(/what is this research about/i) as HTMLTextAreaElement;
    expect(descInput.value).toBe("");
  });

  it("does not submit when name is whitespace only (via direct form submit)", async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Clear the name input and type only spaces
    const nameInput = scoped.getByDisplayValue("Test Project");
    await user.clear(nameInput);
    await user.type(nameInput, "   ");

    // Directly fire submit on the form element to bypass disabled button
    const form = dialog.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("sends undefined for empty description", async () => {
    mockMutate.mockImplementation((_data: unknown, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    const user = userEvent.setup();
    renderDialog({
      project: { id: "p-4", name: "Test", description: "Some text", status: "ready" },
    });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    const descInput = scoped.getByDisplayValue("Some text");
    await user.clear(descInput);

    await user.click(scoped.getByRole("button", { name: /save changes/i }));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: undefined,
        }),
      }),
      expect.anything(),
    );
  });
});
