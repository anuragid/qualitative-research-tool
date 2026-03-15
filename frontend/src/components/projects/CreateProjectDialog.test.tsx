import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CreateProjectDialog from "./CreateProjectDialog";

// Mock useCreateProject hook
const mockMutateAsync = vi.fn();
let mockIsPending = false;
let mockError: Error | null = null;

vi.mock("../../hooks/useProjects", () => ({
  useCreateProject: () => ({
    mutateAsync: mockMutateAsync,
    isPending: mockIsPending,
    error: mockError,
  }),
}));

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderDialog() {
  return render(
    <QueryClientProvider client={queryClient()}>
      <CreateProjectDialog />
    </QueryClientProvider>,
  );
}

/** Get the visible dialog content element to scope queries inside it. */
function getDialogContent() {
  // Radix renders dialog content into a portal with role="dialog"
  const dialogs = screen.getAllByRole("dialog");
  // Get the one that is actually visible (not the hidden accessibility wrapper)
  return dialogs[0];
}

describe("CreateProjectDialog", () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
    mockIsPending = false;
    mockError = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the trigger button", () => {
    renderDialog();
    expect(screen.getByText("New Project")).toBeDefined();
  });

  it("opens the dialog when trigger is clicked", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("New Project"));

    const dialog = getDialogContent();
    const scoped = within(dialog);
    expect(scoped.getByText("Create New Project")).toBeDefined();
    expect(scoped.getByLabelText(/project name/i)).toBeDefined();
    expect(scoped.getByLabelText(/description/i)).toBeDefined();
  });

  it("submits the form with name and description and resets on success", async () => {
    mockMutateAsync.mockResolvedValue({ id: "new-1", name: "Test" });
    const user = userEvent.setup();
    renderDialog();

    // Open dialog
    await user.click(screen.getByText("New Project"));

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Fill in name and description
    const nameInput = scoped.getByLabelText(/project name/i);
    const descInput = scoped.getByLabelText(/description/i);

    await user.type(nameInput, "My Research");
    await user.type(descInput, "A cool study");

    // Submit
    await user.click(scoped.getByRole("button", { name: /create project/i }));

    expect(mockMutateAsync).toHaveBeenCalledWith({
      name: "My Research",
      description: "A cool study",
    });

    // After successful submission, dialog should close
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("does not submit when name is empty (via direct form submit)", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("New Project"));

    const dialog = getDialogContent();

    // Directly fire submit on the form to bypass browser required validation
    const form = dialog.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("does not submit when name is whitespace only", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("New Project"));

    const dialog = getDialogContent();
    const scoped = within(dialog);

    const nameInput = scoped.getByLabelText(/project name/i);
    await user.type(nameInput, "   ");

    // Directly fire submit to bypass browser required validation
    const form = dialog.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("closes dialog when cancel is clicked", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("New Project"));

    const dialog = getDialogContent();
    const scoped = within(dialog);
    expect(scoped.getByText("Create New Project")).toBeDefined();

    await user.click(scoped.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("shows error message when mutation has error", async () => {
    mockError = new Error("Network error");
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("New Project"));

    const dialog = getDialogContent();
    const scoped = within(dialog);
    expect(scoped.getByText("Failed to save. Please try again.")).toBeDefined();
  });

  it("handles mutateAsync rejection without crashing", async () => {
    mockMutateAsync.mockRejectedValue(new Error("Server error"));
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("New Project"));

    const dialog = getDialogContent();
    const scoped = within(dialog);

    const nameInput = scoped.getByLabelText(/project name/i);
    await user.type(nameInput, "Failing Project");

    // Submit - should not throw
    await user.click(scoped.getByRole("button", { name: /create project/i }));

    expect(mockMutateAsync).toHaveBeenCalled();
    // Dialog should still be open (didn't close on error)
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("shows 'Creating...' text when mutation is pending", async () => {
    mockIsPending = true;
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("New Project"));

    const dialog = getDialogContent();
    const scoped = within(dialog);
    expect(scoped.getByText("Creating...")).toBeDefined();
  });
});
