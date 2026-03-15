import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelSettingsDialog } from "./ModelSettingsDialog";

// Mock useSettings hook
const mockUpdateSettings = vi.fn();
const mockDeleteApiKey = vi.fn();
let mockSettings: {
  preferred_model: string | null;
  has_api_key: boolean;
  available_models: { id: string; name: string; tier: string }[];
} | undefined = undefined;
let mockIsLoading = false;
let mockIsUpdating = false;
let mockIsDeletingKey = false;

vi.mock("../../hooks/useSettings", () => ({
  useSettings: () => ({
    settings: mockSettings,
    isLoading: mockIsLoading,
    updateSettings: mockUpdateSettings,
    isUpdating: mockIsUpdating,
    deleteApiKey: mockDeleteApiKey,
    isDeletingKey: mockIsDeletingKey,
  }),
}));

function renderDialog(props: Partial<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = {}) {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    ...props,
  };
  const result = render(<ModelSettingsDialog {...defaultProps} />);
  return { ...result, onOpenChange: defaultProps.onOpenChange };
}

/** Get the visible dialog content element to scope queries. */
function getDialogContent() {
  const dialogs = screen.getAllByRole("dialog");
  return dialogs[0];
}

describe("ModelSettingsDialog", () => {
  beforeEach(() => {
    mockUpdateSettings.mockReset();
    mockDeleteApiKey.mockReset();
    mockIsLoading = false;
    mockIsUpdating = false;
    mockIsDeletingKey = false;
    mockSettings = {
      preferred_model: "free-model-1",
      has_api_key: false,
      available_models: [
        { id: "free-model-1", name: "Free Model One", tier: "free" },
        { id: "free-model-2", name: "Free Model Two", tier: "free" },
        { id: "premium-model-1", name: "Premium Model One", tier: "premium" },
      ],
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("returns null when isLoading", () => {
    mockIsLoading = true;
    const { container } = renderDialog();

    // Should render nothing
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog with model options when open and loaded", () => {
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("Model Settings")).toBeDefined();
    expect(scoped.getByText("Free Model One")).toBeDefined();
    expect(scoped.getByText("Free Model Two")).toBeDefined();
    expect(scoped.getByText("Premium Model One")).toBeDefined();
  });

  it("shows free and premium model sections", () => {
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("Free Models")).toBeDefined();
    expect(scoped.getByText("Premium Models")).toBeDefined();
  });

  it("disables premium model radio when no API key and no key entered", () => {
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Premium radio button -- look inside the dialog
    const premiumLabels = scoped.getAllByText("Premium Model One");
    // The label contains the text; the radio is a sibling
    const premiumLabel = premiumLabels[0].closest("label") as HTMLElement;
    const radio = premiumLabel.querySelector('[role="radio"]') as HTMLButtonElement;
    expect(radio).toHaveProperty("disabled", true);
  });

  it("calls updateSettings and closes dialog on save", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onOpenChange });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    await user.click(scoped.getByRole("button", { name: /^save$/i }));

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      preferred_model: "free-model-1",
      api_key: undefined,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("saves with entered API key", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onOpenChange });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Enter API key
    const keyInput = scoped.getByPlaceholderText("sk-or-v1-...");
    await user.type(keyInput, "sk-or-v1-test-key");

    await user.click(scoped.getByRole("button", { name: /^save$/i }));

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      preferred_model: "free-model-1",
      api_key: "sk-or-v1-test-key",
    });
  });

  it("shows 'API key configured' and remove button when has_api_key", () => {
    mockSettings = {
      ...mockSettings!,
      has_api_key: true,
    };
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("API key configured")).toBeDefined();
    expect(scoped.getByRole("button", { name: /remove/i })).toBeDefined();
  });

  it("calls deleteApiKey and resets state when remove is clicked", async () => {
    mockSettings = {
      ...mockSettings!,
      has_api_key: true,
    };
    const user = userEvent.setup();
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    await user.click(scoped.getByRole("button", { name: /remove/i }));

    expect(mockDeleteApiKey).toHaveBeenCalled();
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

  it("shows 'Saving...' when isUpdating", () => {
    mockIsUpdating = true;
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("Saving...")).toBeDefined();
  });

  it("disables save button when isUpdating", () => {
    mockIsUpdating = true;
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    const saveBtn = scoped.getByRole("button", { name: /saving/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it("shows API key input when no key is configured", () => {
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByPlaceholderText("sk-or-v1-...")).toBeDefined();
  });

  it("allows selecting a different model", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onOpenChange });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Click on the second free model label
    const freeModel2Label = scoped.getByText("Free Model Two").closest("label") as HTMLElement;
    const radio = freeModel2Label.querySelector('[role="radio"]') as HTMLElement;
    await user.click(radio);

    await user.click(scoped.getByRole("button", { name: /^save$/i }));

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      preferred_model: "free-model-2",
      api_key: undefined,
    });
  });

  it("renders OpenRouter link", () => {
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    const link = scoped.getByRole("link", { name: /openrouter\.ai\/keys/i }) as HTMLAnchorElement;
    expect(link.href).toContain("openrouter.ai/keys");
    expect(link.target).toBe("_blank");
  });

  it("handles settings with no available models", () => {
    mockSettings = {
      preferred_model: null,
      has_api_key: false,
      available_models: [],
    };
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Should still render without crashing
    expect(scoped.getByText("Model Settings")).toBeDefined();
  });

  it("uses first free model as default when no preferred_model and selectedModel is null", () => {
    mockSettings = {
      preferred_model: null,
      has_api_key: false,
      available_models: [
        { id: "default-free", name: "Default Free", tier: "free" },
      ],
    };
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    const label = scoped.getByText("Default Free").closest("label") as HTMLElement;
    const radio = label.querySelector('[role="radio"]') as HTMLElement;
    // The radio should be checked (default selection)
    expect(radio.getAttribute("data-state")).toBe("checked");
  });
});
