import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelSettingsDialog } from "./ModelSettingsDialog";

// Polyfill ResizeObserver for jsdom (required by Radix ScrollArea)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Mock useSettings hook
const mockUpdateSettings = vi.fn();
const mockDeleteApiKey = vi.fn();
const mockResetUpdateError = vi.fn();
let mockSettings: {
  preferred_model: string | null;
  has_api_key: boolean;
  key_hint?: string | null;
  available_models: { id: string; name: string; tier: string }[];
} | undefined = undefined;
let mockRecommended: {
  standard: { id: string; name: string; description: string };
  advanced: { id: string; name: string; description: string };
} | undefined = undefined;
let mockIsLoading = false;
let mockIsUpdating = false;
let mockIsDeletingKey = false;
let mockUpdateError: Error | null = null;

vi.mock("../../hooks/useSettings", () => ({
  useSettings: () => ({
    settings: mockSettings,
    isLoading: mockIsLoading,
    recommended: mockRecommended,
    isLoadingRecommended: false,
    updateSettings: mockUpdateSettings,
    isUpdating: mockIsUpdating,
    updateError: mockUpdateError,
    resetUpdateError: mockResetUpdateError,
    deleteApiKey: mockDeleteApiKey,
    isDeletingKey: mockIsDeletingKey,
  }),
}));

// Mock settingsService for search
const mockSearchModels = vi.fn().mockResolvedValue([]);
vi.mock("../../services/settings", () => ({
  settingsService: {
    searchModels: (...args: unknown[]) => mockSearchModels(...args),
  },
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
    mockResetUpdateError.mockReset();
    // Make updateSettings invoke onSuccess callback for save tests
    mockUpdateSettings.mockImplementation((_data: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });
    mockIsLoading = false;
    mockIsUpdating = false;
    mockIsDeletingKey = false;
    mockUpdateError = null;
    mockSettings = {
      preferred_model: null,
      has_api_key: false,
      available_models: [],
    };
    mockRecommended = {
      standard: { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout", description: "Included model -- no API key needed" },
      advanced: { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", description: "Premium model" },
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

  it("renders dialog with tier cards when open and loaded", () => {
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("Model Settings")).toBeDefined();
    expect(scoped.getByText("Standard")).toBeDefined();
    expect(scoped.getByText("Advanced")).toBeDefined();
    expect(scoped.getByText("Custom")).toBeDefined();
  });

  it("shows recommended model names as tier card descriptions", () => {
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // The standard model name appears in the tier card and the detail panel
    expect(scoped.getAllByText("Llama 4 Scout").length).toBeGreaterThanOrEqual(1);
  });

  it("defaults to standard tier when no preferred model is set", () => {
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // The detail panel should show the standard model description
    expect(scoped.getByText("Included model -- no API key needed")).toBeDefined();
  });

  it("calls updateSettings with standard model and closes dialog on save", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onOpenChange });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    await user.click(scoped.getByRole("button", { name: /^save$/i }));

    expect(mockUpdateSettings).toHaveBeenCalledWith(
      {
        preferred_model: "meta-llama/llama-4-scout",
        api_key: undefined,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("switches to advanced tier on click and shows advanced detail panel", async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Click the Advanced tier card
    await user.click(scoped.getByText("Advanced"));

    // Detail panel should now show advanced model info
    // "Claude Sonnet 4.6" appears in both the tier card and detail panel
    expect(scoped.getAllByText("Claude Sonnet 4.6").length).toBeGreaterThanOrEqual(1);
    expect(scoped.getByText("Premium model")).toBeDefined();
  });

  it("shows inline API key input when Advanced is selected and no key exists", async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    await user.click(scoped.getByText("Advanced"));

    // Should show an API key input in the detail panel
    const keyInputs = scoped.getAllByPlaceholderText("sk-or-v1-...");
    expect(keyInputs.length).toBeGreaterThanOrEqual(1);
  });

  it("shows remove button and key hint when has_api_key", () => {
    mockSettings = {
      ...mockSettings!,
      has_api_key: true,
      key_hint: "ab12",
    };
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText(/\.\.\.ab12/)).toBeDefined();
    expect(scoped.getByRole("button", { name: /remove/i })).toBeDefined();
  });

  it("calls deleteApiKey when remove is clicked", async () => {
    mockSettings = {
      ...mockSettings!,
      has_api_key: true,
      key_hint: "ab12",
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

  it("shows 'Validating...' when isUpdating", () => {
    mockIsUpdating = true;
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("Validating...")).toBeDefined();
  });

  it("disables save button when isUpdating", () => {
    mockIsUpdating = true;
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    const saveBtn = scoped.getByRole("button", { name: /validating/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it("renders OpenRouter link", () => {
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    const link = scoped.getByRole("link", { name: /openrouter\.ai\/keys/i }) as HTMLAnchorElement;
    expect(link.href).toContain("openrouter.ai/keys");
    expect(link.target).toBe("_blank");
  });

  it("handles missing recommended models gracefully", () => {
    mockRecommended = undefined;
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Should still render without crashing
    expect(scoped.getByText("Model Settings")).toBeDefined();
    // Loading placeholder shown for model names
    expect(scoped.getAllByText("Loading...").length).toBeGreaterThanOrEqual(1);
  });

  it("selects custom tier and shows search input", async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    await user.click(scoped.getByText("Custom"));

    expect(scoped.getByPlaceholderText("Search OpenRouter models...")).toBeDefined();
  });

  it("disables save when custom tier is selected but no model is picked", async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    await user.click(scoped.getByText("Custom"));

    const saveBtn = scoped.getByRole("button", { name: /^save$/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it("infers advanced tier when preferred model matches advanced recommendation", () => {
    mockSettings = {
      ...mockSettings!,
      preferred_model: "anthropic/claude-sonnet-4.6",
      has_api_key: true,
    };
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Detail panel should show advanced model info since that tier is active
    expect(scoped.getByText("Premium model")).toBeDefined();
  });

  it("infers custom tier when preferred model is not a recommended model", () => {
    mockSettings = {
      ...mockSettings!,
      preferred_model: "openai/gpt-5.4",
      has_api_key: true,
    };
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Custom tier should be active; the model ID should appear in the selected model panel and the tier card
    expect(scoped.getAllByText("openai/gpt-5.4").length).toBeGreaterThanOrEqual(1);
  });

  it("renders error banner when updateError is set", () => {
    mockUpdateError = new Error("Invalid API key or insufficient credits.");
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("Invalid API key or insufficient credits.")).toBeDefined();
  });

  it("handleRemoveKey resets tier to standard via onSuccess callback", async () => {
    mockSettings = {
      ...mockSettings!,
      preferred_model: "anthropic/claude-sonnet-4.6",
      has_api_key: true,
      key_hint: "ab12",
    };
    // Make deleteApiKey invoke onSuccess callback
    mockDeleteApiKey.mockImplementation((_data: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });
    const user = userEvent.setup();
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    await user.click(scoped.getByRole("button", { name: /remove/i }));

    expect(mockDeleteApiKey).toHaveBeenCalled();
    // After onSuccess, the standard tier detail panel should be shown
    expect(scoped.getByText("Included model -- no API key needed")).toBeDefined();
  });

  it("renders search results and selects a model", async () => {
    mockSearchModels.mockResolvedValue([
      { id: "openai/gpt-5.4", name: "GPT-5.4", provider: "Openai", context_length: 128000, is_free: false },
      { id: "meta/llama-4:free", name: "Llama 4", provider: "Meta", context_length: 32000, is_free: true },
    ]);
    const user = userEvent.setup();
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Switch to Custom tier
    await user.click(scoped.getByText("Custom"));

    // Type in search box (debounce is 350ms)
    const searchInput = scoped.getByPlaceholderText("Search OpenRouter models...");
    await user.type(searchInput, "gpt");

    // Wait for search results to appear
    const result = await screen.findByText("GPT-5.4");
    expect(result).toBeDefined();

    // Click on the result to select it
    await user.click(result);

    // After selection, the selected model panel should show and search results should be gone
    expect(scoped.getByText("openai/gpt-5.4")).toBeDefined();
  });

  it("non-BYOK Custom search passes freeOnly=true to searchModels", async () => {
    mockSearchModels.mockResolvedValue([
      { id: "meta/llama-4:free", name: "Llama 4", provider: "Meta", context_length: 32000, is_free: true },
    ]);
    // has_api_key defaults to false in beforeEach
    const user = userEvent.setup();
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    await user.click(scoped.getByText("Custom"));

    const searchInput = scoped.getByPlaceholderText("Search OpenRouter models...");
    await user.type(searchInput, "llama");

    // Wait for search to trigger
    await screen.findByText("Llama 4");

    // Verify searchModels was called with freeOnly=true (second arg)
    expect(mockSearchModels).toHaveBeenCalledWith("llama", true);
  });

  it("BYOK Custom search passes freeOnly=false to searchModels", async () => {
    mockSettings = {
      ...mockSettings!,
      has_api_key: true,
    };
    mockSearchModels.mockResolvedValue([
      { id: "openai/gpt-5.4", name: "GPT-5.4", provider: "Openai", context_length: 128000, is_free: false },
    ]);
    const user = userEvent.setup();
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    await user.click(scoped.getByText("Custom"));

    const searchInput = scoped.getByPlaceholderText("Search OpenRouter models...");
    await user.type(searchInput, "gpt");

    await screen.findByText("GPT-5.4");

    // Verify searchModels was called with freeOnly=false (second arg)
    expect(mockSearchModels).toHaveBeenCalledWith("gpt", false);
  });

  it("Advanced tier card shows lock icon when no API key", () => {
    // has_api_key defaults to false in beforeEach
    renderDialog();

    const dialog = getDialogContent();

    // The lock icon should be present (via aria-label)
    const lockIcon = within(dialog).getByLabelText("Requires API key");
    expect(lockIcon).toBeDefined();
  });

  it("Advanced tier card hides lock icon when BYOK key exists", () => {
    mockSettings = {
      ...mockSettings!,
      has_api_key: true,
    };
    renderDialog();

    const dialog = getDialogContent();

    // The lock icon should NOT be present
    expect(within(dialog).queryByLabelText("Requires API key")).toBeNull();
  });

  it("Custom card subtitle shows 'Included models' when no BYOK key", () => {
    // has_api_key defaults to false in beforeEach
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("Included models")).toBeDefined();
  });

  it("Custom card subtitle shows 'Any model' when BYOK key exists", () => {
    mockSettings = {
      ...mockSettings!,
      has_api_key: true,
    };
    renderDialog();

    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("Any model")).toBeDefined();
  });

  it("sends API key to updateSettings on save when key is entered", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onOpenChange });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Switch to Advanced tier to reveal the API key input
    await user.click(scoped.getByText("Advanced"));

    // Enter an API key using fireEvent.change (not user.type) because the
    // inline key input conditionally renders based on apiKey being empty --
    // user.type types one char at a time, making the input disappear after
    // the first keystroke sets apiKey to a truthy value.
    const keyInput = scoped.getAllByPlaceholderText("sk-or-v1-...")[0];
    fireEvent.change(keyInput, { target: { value: "sk-or-v1-testkey123" } });

    // Click Save
    await user.click(scoped.getByRole("button", { name: /^save$/i }));

    expect(mockUpdateSettings).toHaveBeenCalledWith(
      {
        preferred_model: "anthropic/claude-sonnet-4.6",
        api_key: "sk-or-v1-testkey123",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
