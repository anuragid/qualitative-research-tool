import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelSettingsDialog } from "./ModelSettingsDialog";

// Mock useSettings hook
const mockUpdateSettings = vi.fn();
const mockDeleteApiKey = vi.fn();
const mockResetUpdateError = vi.fn();
const mockRefreshBalance = vi.fn();
let mockSettings:
  | {
      preferred_model: string | null;
      has_api_key: boolean;
      key_hint?: string | null;
      available_models: {
        id: string;
        name: string;
        tier: string;
        provider?: string;
      }[];
      balance?: import("../../types").BalanceInfo | null;
      low_balance_threshold_usd?: number;
    }
  | undefined = undefined;
let mockIsLoading = false;
let mockIsUpdating = false;
let mockIsDeletingKey = false;
let mockIsRefreshingBalance = false;
let mockUpdateError: Error | null = null;
let mockRefreshBalanceError: Error | null = null;

vi.mock("../../hooks/useSettings", () => ({
  useSettings: () => ({
    settings: mockSettings,
    isLoading: mockIsLoading,
    recommended: undefined,
    isLoadingRecommended: false,
    updateSettings: mockUpdateSettings,
    isUpdating: mockIsUpdating,
    updateError: mockUpdateError,
    resetUpdateError: mockResetUpdateError,
    deleteApiKey: mockDeleteApiKey,
    isDeletingKey: mockIsDeletingKey,
    refreshBalance: mockRefreshBalance,
    isRefreshingBalance: mockIsRefreshingBalance,
    refreshBalanceError: mockRefreshBalanceError,
  }),
}));

const STANDARD_MODELS = [
  { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout", tier: "standard", provider: "Meta" },
  { id: "nvidia/nemotron-3-super-120b-a12b", name: "Nemotron 3 Super 120B", tier: "standard", provider: "NVIDIA" },
  { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek V3", tier: "standard", provider: "DeepSeek" },
];

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

function getDialogContent() {
  const dialogs = screen.getAllByRole("dialog");
  return dialogs[0];
}

describe("ModelSettingsDialog", () => {
  beforeEach(() => {
    mockUpdateSettings.mockReset();
    mockDeleteApiKey.mockReset();
    mockResetUpdateError.mockReset();
    mockRefreshBalance.mockReset();
    mockRefreshBalance.mockResolvedValue(null);
    mockUpdateSettings.mockImplementation((_data: unknown, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.();
    });
    mockIsLoading = false;
    mockIsUpdating = false;
    mockIsDeletingKey = false;
    mockIsRefreshingBalance = false;
    mockUpdateError = null;
    mockRefreshBalanceError = null;
    mockSettings = {
      preferred_model: null,
      has_api_key: false,
      available_models: STANDARD_MODELS,
      balance: null,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("returns null when isLoading", () => {
    mockIsLoading = true;
    const { container } = renderDialog();
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog with standard models listed", () => {
    renderDialog();
    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("Model Settings")).toBeDefined();
    expect(scoped.getByText("Standard Models")).toBeDefined();
    expect(scoped.getByText("Llama 4 Scout")).toBeDefined();
    expect(scoped.getByText("Nemotron 3 Super 120B")).toBeDefined();
    expect(scoped.getByText("Ministral 8B")).toBeDefined();
    expect(scoped.getByText("DeepSeek V3")).toBeDefined();
  });

  it("shows provider for each standard model", () => {
    renderDialog();
    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("Meta")).toBeDefined();
    expect(scoped.getByText("NVIDIA")).toBeDefined();
    expect(scoped.getByText("Mistral")).toBeDefined();
    expect(scoped.getByText("DeepSeek")).toBeDefined();
  });

  it("defaults to first standard model when no preference set", () => {
    renderDialog();
    const dialog = getDialogContent();
    const scoped = within(dialog);

    // First model card should be highlighted
    const radioButtons = scoped.getAllByRole("radio");
    expect(radioButtons.length).toBe(4);
  });

  it("calls updateSettings with selected model on save", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onOpenChange });

    const dialog = getDialogContent();
    const scoped = within(dialog);

    // Click Nemotron model
    await user.click(scoped.getByText("Nemotron 3 Super 120B"));

    await user.click(scoped.getByRole("button", { name: /^save$/i }));

    expect(mockUpdateSettings).toHaveBeenCalledWith(
      {
        preferred_model: "nvidia/nemotron-3-super-120b-a12b",
        api_key: undefined,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows premium section locked when no API key", () => {
    renderDialog();
    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("Premium Models")).toBeDefined();
    expect(scoped.getByText("Add your API key below to unlock premium models.")).toBeDefined();
  });

  it("shows model ID input when API key exists", () => {
    mockSettings = {
      ...mockSettings!,
      has_api_key: true,
      key_hint: "2359",
    };
    renderDialog();
    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByPlaceholderText(/anthropic\/claude-sonnet/)).toBeDefined();
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

  it("renders OpenRouter links", () => {
    renderDialog();
    const dialog = getDialogContent();
    const scoped = within(dialog);

    const links = scoped.getAllByRole("link");
    const keyLink = links.find((l) => (l as HTMLAnchorElement).href.includes("openrouter.ai/keys"));
    expect(keyLink).toBeDefined();
  });

  it("renders error banner when updateError is set", () => {
    mockUpdateError = new Error("Invalid API key or insufficient credits.");
    renderDialog();
    const dialog = getDialogContent();
    const scoped = within(dialog);

    expect(scoped.getByText("Invalid API key or insufficient credits.")).toBeDefined();
  });

  it("resets error state on dialog open", () => {
    renderDialog();
    expect(mockResetUpdateError).toHaveBeenCalled();
  });

  // ---- BalanceDisplay integration ----

  it("does not render BalanceDisplay when has_api_key is false", () => {
    mockSettings = {
      ...mockSettings!,
      has_api_key: false,
      balance: null,
    };
    renderDialog();
    const dialog = getDialogContent();
    expect(
      dialog.querySelector('[data-slot="balance-display"]'),
    ).toBeNull();
    expect(
      dialog.querySelector('[data-slot="alert-banner"]'),
    ).toBeNull();
  });

  it("renders BalanceDisplay healthy state when has_api_key with positive balance", () => {
    mockSettings = {
      ...mockSettings!,
      has_api_key: true,
      key_hint: "abcd",
      balance: {
        total_credits: 10,
        total_usage: 2.75,
        balance_remaining: 7.25,
        is_free_tier: false,
        key_label: "sk-or-v1-abc...xyz",
        key_limit: null,
        key_limit_remaining: null,
        has_credits: true,
        checked_at: new Date().toISOString(),
        stale: false,
      },
    };
    renderDialog();
    const dialog = getDialogContent();
    expect(
      dialog.querySelector('[data-slot="balance-display"]'),
    ).not.toBeNull();
  });

  it("renders BalanceDisplay error state when balance has no credits", () => {
    mockSettings = {
      ...mockSettings!,
      has_api_key: true,
      key_hint: "abcd",
      balance: {
        total_credits: 10,
        total_usage: 10,
        balance_remaining: 0,
        is_free_tier: false,
        key_label: "sk-or-v1-abc...xyz",
        key_limit: null,
        key_limit_remaining: null,
        has_credits: false,
        checked_at: new Date().toISOString(),
        stale: false,
      },
    };
    renderDialog();
    const dialog = getDialogContent();
    const errorBanner = dialog.querySelector(
      '[data-slot="alert-banner"][data-variant="error"]',
    );
    expect(errorBanner).not.toBeNull();
    expect(errorBanner!.textContent).toMatch(/no credits/i);
  });

  it("clicking refresh in BalanceDisplay calls refreshBalance from hook", async () => {
    mockSettings = {
      ...mockSettings!,
      has_api_key: true,
      key_hint: "abcd",
      balance: {
        total_credits: 10,
        total_usage: 2.75,
        balance_remaining: 7.25,
        is_free_tier: false,
        key_label: "sk-or-v1-abc...xyz",
        key_limit: null,
        key_limit_remaining: null,
        has_credits: true,
        checked_at: new Date().toISOString(),
        stale: false,
      },
    };
    const user = userEvent.setup();
    renderDialog();
    const dialog = getDialogContent();

    const display = dialog.querySelector('[data-slot="balance-display"]');
    expect(display).not.toBeNull();
    const refreshBtn = display!.querySelector(
      "button",
    ) as HTMLButtonElement | null;
    expect(refreshBtn).not.toBeNull();
    await user.click(refreshBtn!);
    expect(mockRefreshBalance).toHaveBeenCalled();
  });
});
