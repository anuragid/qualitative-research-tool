// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// userEvent inside a radix Dialog hits "pointer-events: none" on portaled
// combobox options because the Dialog's modal body lock leaks into siblings.
// Disable the pointer-events check for this suite — interactions are still
// dispatched, just without the reachability assertion.
function setupUser() {
  return userEvent.setup({
    pointerEventsCheck: PointerEventsCheckLevel.Never,
  });
}

import { ModelSettingsDialog } from "./ModelSettingsDialog";
import { settingsService } from "../../services/settings";
import type { UserSettings, SearchModel } from "../../services/settings";
import type { BalanceInfo } from "../../types";

// ── Test helpers ─────────────────────────────────────────────────────────

const STANDARD_MODELS = [
  { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout", tier: "standard", provider: "Meta" },
  { id: "nvidia/nemotron-3-super-120b-a12b", name: "Nemotron 3 Super 120B", tier: "standard", provider: "NVIDIA" },
  { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek V3", tier: "standard", provider: "DeepSeek" },
];

function makeSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    preferred_model: null,
    has_api_key: false,
    key_hint: null,
    key_validated_at: null,
    available_models: STANDARD_MODELS,
    balance: null,
    ...overrides,
  };
}

function healthyBalance(): BalanceInfo {
  return {
    total_credits: 10,
    total_usage: 1.48,
    balance_remaining: 8.52,
    is_free_tier: false,
    key_label: "sk-or-v1-abc...xyz",
    key_limit: null,
    key_limit_remaining: null,
    has_credits: true,
    checked_at: "2026-04-06T12:00:00Z",
    stale: false,
  };
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function renderDialog() {
  const onOpenChange = vi.fn();
  const utils = render(
    <ModelSettingsDialog open onOpenChange={onOpenChange} />,
    { wrapper: makeWrapper() },
  );
  return { ...utils, onOpenChange };
}

function getStandardTab(): HTMLElement {
  return screen.getByRole("tab", { name: /standard/i });
}

function getPremiumTab(): HTMLElement {
  return screen.getByRole("tab", { name: /premium/i });
}

// ── Default mocks ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(settingsService, "getRecommendedModels").mockResolvedValue({
    standard: { id: "x", name: "x", description: "x" },
    advanced: { id: "y", name: "y", description: "y" },
  });
  vi.spyOn(settingsService, "searchModels").mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

// ── Mode initialization ──────────────────────────────────────────────────

describe("ModelSettingsDialog — mode initialization", () => {
  it("opens in Standard mode when no key and no preferred model", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(makeSettings());
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("Model Settings")).toBeDefined();
    });

    expect(getStandardTab().getAttribute("data-state")).toBe("active");
    // Combobox is not rendered in Standard mode
    expect(screen.queryByPlaceholderText(/search models/i)).toBeNull();
  });

  it("opens in Premium mode when key exists, even if saved model is standard, and pre-pops the default sonnet pick", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        has_api_key: true,
        key_hint: "1234",
        preferred_model: "meta-llama/llama-4-scout",
        balance: healthyBalance(),
      }),
    );
    renderDialog();

    // Once a key is on file the user is committed to Premium — Standard is
    // unreachable until the key is removed.
    await waitFor(() => {
      expect(getPremiumTab().getAttribute("data-state")).toBe("active");
    });
    expect((getStandardTab() as HTMLButtonElement).disabled).toBe(true);

    // The "Selected model" row shows the pending default (latest Sonnet),
    // not the carried-over standard model id.
    const selected = screen.getByTestId("selected-model-display");
    expect(selected.textContent).toMatch(/anthropic\/claude-sonnet-4\.6/i);

    // Save is enabled (pending pick differs from saved standard model).
    const saveBtn = screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
  });

  it("Standard tab is disabled while a key is on file", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        has_api_key: true,
        key_hint: "1234",
        preferred_model: "anthropic/claude-sonnet-4.6",
        balance: healthyBalance(),
      }),
    );
    renderDialog();

    await waitFor(() => {
      expect(getPremiumTab().getAttribute("data-state")).toBe("active");
    });
    const standardTab = getStandardTab() as HTMLButtonElement;
    expect(standardTab.disabled).toBe(true);
  });

  it("opens in Premium mode when saved model is premium", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        has_api_key: true,
        key_hint: "1234",
        preferred_model: "anthropic/claude-sonnet-4.6",
        balance: healthyBalance(),
      }),
    );
    renderDialog();

    await waitFor(() => {
      expect(getPremiumTab().getAttribute("data-state")).toBe("active");
    });
    expect(screen.getByText(/key ending in.*1234/i)).toBeDefined();
    expect(screen.getByText(/8\.52.*of.*\$10/i)).toBeDefined();
  });
});

// ── Standard mode ────────────────────────────────────────────────────────

describe("ModelSettingsDialog — Standard mode", () => {
  beforeEach(() => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({ preferred_model: "meta-llama/llama-4-scout" }),
    );
  });

  it("Save is disabled with no pending change", async () => {
    renderDialog();
    await waitFor(() => {
      const saveBtn = screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });
  });

  it("picking a different standard radio enables Save and PUTs preferred-model", async () => {
    const updateSpy = vi
      .spyOn(settingsService, "updatePreferredModel")
      .mockResolvedValue(
        makeSettings({ preferred_model: "deepseek/deepseek-chat-v3-0324" }),
      );

    const user = setupUser();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /deepseek/i })).toBeDefined();
    });
    await user.click(screen.getByRole("radio", { name: /deepseek/i }));
    const saveBtn = screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    await user.click(saveBtn);
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith("deepseek/deepseek-chat-v3-0324");
    });
  });

  it("clicking the already-selected radio leaves Save disabled", async () => {
    const user = setupUser();
    renderDialog();
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /llama 4 scout/i })).toBeDefined();
    });

    await user.click(screen.getByRole("radio", { name: /llama 4 scout/i }));
    const saveBtn = screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });
});

// ── Premium mode, no key ─────────────────────────────────────────────────

describe("ModelSettingsDialog — Premium mode, no key", () => {
  let settingsState: UserSettings;

  beforeEach(() => {
    settingsState = makeSettings();
    vi.spyOn(settingsService, "getSettings").mockImplementation(async () => settingsState);
  });

  it("switching to Premium reveals the key input, no combobox", async () => {
    const user = setupUser();
    renderDialog();

    await waitFor(() => {
      expect(getPremiumTab()).toBeDefined();
    });
    await user.click(getPremiumTab());
    expect(screen.getByPlaceholderText(/sk-or-v1/i)).toBeDefined();
    expect(screen.queryByPlaceholderText(/search models/i)).toBeNull();
  });

  it("Validate button is disabled until the key is at least 10 chars", async () => {
    const user = setupUser();
    renderDialog();
    await waitFor(() => {
      expect(getPremiumTab()).toBeDefined();
    });
    await user.click(getPremiumTab());

    const input = screen.getByPlaceholderText(/sk-or-v1/i);
    const validateBtn = screen.getByRole("button", {
      name: /validate/i,
    }) as HTMLButtonElement;

    expect(validateBtn.disabled).toBe(true);
    await user.type(input, "short");
    expect(validateBtn.disabled).toBe(true);
    await user.type(input, "1234567890");
    expect(validateBtn.disabled).toBe(false);
  });

  it("on validate success, combobox mounts and balance shows", async () => {
    const validatedSettings = makeSettings({
      has_api_key: true,
      key_hint: "1234",
      balance: healthyBalance(),
    });
    const addKeySpy = vi
      .spyOn(settingsService, "addApiKey")
      .mockImplementation(async () => {
        // Server-side state is now updated; subsequent getSettings reflects it.
        settingsState = validatedSettings;
        return validatedSettings;
      });

    const user = setupUser();
    renderDialog();

    await waitFor(() => {
      expect(getPremiumTab()).toBeDefined();
    });
    await user.click(getPremiumTab());
    await user.type(
      screen.getByPlaceholderText(/sk-or-v1/i),
      "sk-or-v1-test1234",
    );
    await user.click(screen.getByRole("button", { name: /validate/i }));

    await waitFor(() => {
      expect(addKeySpy).toHaveBeenCalledWith("sk-or-v1-test1234");
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search models/i)).toBeDefined();
    });
    expect(screen.getByText(/8\.52.*of.*\$10/i)).toBeDefined();
  });

  it("on validate failure, error surfaces inline and combobox stays absent", async () => {
    vi.spyOn(settingsService, "addApiKey").mockRejectedValue({
      response: {
        status: 400,
        data: { detail: "Your OpenRouter key has $0 credits..." },
      },
      message: "Request failed",
    });

    const user = setupUser();
    renderDialog();

    await waitFor(() => {
      expect(getPremiumTab()).toBeDefined();
    });
    await user.click(getPremiumTab());
    await user.type(
      screen.getByPlaceholderText(/sk-or-v1/i),
      "sk-or-v1-empty1234",
    );
    await user.click(screen.getByRole("button", { name: /validate/i }));

    await waitFor(() => {
      expect(screen.getByText(/\$0 credits|invalid api key/i)).toBeDefined();
    });
    expect(screen.queryByPlaceholderText(/search models/i)).toBeNull();
  });

  it("on no-credits 400, renders inline error and shows a 'Add credits' link to openrouter.ai/settings/credits", async () => {
    vi.spyOn(settingsService, "addApiKey").mockRejectedValue({
      response: {
        status: 400,
        data: { detail: "Your OpenRouter key has $0 credits. Please add credits to continue." },
      },
      message: "Request failed",
    });

    const user = setupUser();
    renderDialog();

    await waitFor(() => {
      expect(getPremiumTab()).toBeDefined();
    });
    await user.click(getPremiumTab());
    await user.type(
      screen.getByPlaceholderText(/sk-or-v1/i),
      "sk-or-v1-nocredits1234",
    );
    await user.click(screen.getByRole("button", { name: /validate/i }));

    await waitFor(() => {
      expect(screen.getByText(/\$0 credits/i)).toBeDefined();
    });

    const link = screen.getByRole("link", { name: /add credits/i }) as HTMLAnchorElement;
    expect(link).toBeDefined();
    expect(link.href).toContain("openrouter.ai/settings/credits");
    expect(screen.queryByPlaceholderText(/search models/i)).toBeNull();
  });
});

// ── Premium mode, validated key ──────────────────────────────────────────

describe("ModelSettingsDialog — Premium mode, validated key", () => {
  beforeEach(() => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        has_api_key: true,
        key_hint: "1234",
        preferred_model: "anthropic/claude-sonnet-4.6",
        balance: healthyBalance(),
      }),
    );
  });

  it("regression: typing in the combobox is not clobbered by re-renders", async () => {
    // Repro of the controlled-value bug: every keystroke would trigger a
    // re-render of the parent, which recomputed `comboboxValue` from
    // `effectiveModel` and reset the input back to the saved label.
    vi.spyOn(settingsService, "searchModels").mockResolvedValue([]);
    const user = setupUser();
    renderDialog();

    const input = (await screen.findByPlaceholderText(
      /search models/i,
    )) as HTMLInputElement;
    await user.type(input, "claude");
    expect(input.value).toBe("claude");
  });

  it("Selected model row shows the saved premium id on open and combobox is empty", async () => {
    renderDialog();
    // The "Selected model" row reflects the saved id.
    const selected = await screen.findByTestId("selected-model-display");
    expect(selected.textContent).toMatch(/anthropic\/claude-sonnet-4\.6/i);

    // The combobox input is empty (it's a search/pick surface, not a value display).
    const combobox = screen.getByRole("combobox") as HTMLInputElement;
    expect(combobox.value).toBe("");
  });

  it("picking a different model enables Save and PUTs preferred-model", async () => {
    const searchResults: SearchModel[] = [
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        provider: "OpenAI",
        context_length: 128000,
        is_free: false,
      },
    ];
    vi.spyOn(settingsService, "searchModels").mockResolvedValue(searchResults);
    const updateSpy = vi
      .spyOn(settingsService, "updatePreferredModel")
      .mockResolvedValue(
        makeSettings({
          has_api_key: true,
          key_hint: "1234",
          preferred_model: "openai/gpt-4o",
          balance: healthyBalance(),
        }),
      );

    const user = setupUser();
    renderDialog();

    const input = await screen.findByPlaceholderText(/search models/i);
    await user.clear(input);
    await user.type(input, "gpt-4o");

    await waitFor(
      () => {
        expect(screen.getByRole("option", { name: /gpt-4o/i })).toBeDefined();
      },
      { timeout: 2000 },
    );
    await user.click(screen.getByRole("option", { name: /gpt-4o/i }));

    await waitFor(() => {
      const saveBtn = screen.getByRole("button", {
        name: /^save$/i,
      }) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith("openai/gpt-4o");
    });
  });

  it("Standard tab is disabled while a key is on file (no tab-switch escape hatch)", async () => {
    const user = setupUser();
    renderDialog();

    await waitFor(() => {
      expect(getPremiumTab().getAttribute("data-state")).toBe("active");
    });

    // The Standard tab is disabled — clicking it does nothing.
    const standardTab = getStandardTab() as HTMLButtonElement;
    expect(standardTab.disabled).toBe(true);
    await user.click(standardTab);
    expect(getPremiumTab().getAttribute("data-state")).toBe("active");
  });

  it("picking a model updates the Selected row and enables Save", async () => {
    const searchResults: SearchModel[] = [
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        provider: "OpenAI",
        context_length: 128000,
        is_free: false,
      },
    ];
    vi.spyOn(settingsService, "searchModels").mockResolvedValue(searchResults);

    const user = setupUser();
    renderDialog();

    const input = await screen.findByPlaceholderText(/search models/i);
    await user.type(input, "gpt-4o");
    await waitFor(
      () => {
        expect(screen.getByRole("option", { name: /gpt-4o/i })).toBeDefined();
      },
      { timeout: 2000 },
    );
    await user.click(screen.getByRole("option", { name: /gpt-4o/i }));

    // The Selected row reflects the new pick — the source of truth for
    // "what model will be saved". The combobox input itself may still show
    // the picked label (normal combobox behavior).
    await waitFor(() => {
      const selected = screen.getByTestId("selected-model-display");
      expect(selected.textContent).toMatch(/openai\/gpt-4o/i);
    });
    const saveBtn = screen.getByRole("button", {
      name: /^save$/i,
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
  });

  it("clicking Remove key flips mode to Standard and clears the combobox", async () => {
    vi.spyOn(settingsService, "deleteApiKey").mockResolvedValue();
    // After delete, settings refetch returns the default standard
    vi.spyOn(settingsService, "getSettings")
      .mockResolvedValueOnce(
        makeSettings({
          has_api_key: true,
          key_hint: "1234",
          preferred_model: "anthropic/claude-sonnet-4.6",
          balance: healthyBalance(),
        }),
      )
      .mockResolvedValue(
        makeSettings({
          has_api_key: false,
          preferred_model: "meta-llama/llama-4-scout",
        }),
      );

    const user = setupUser();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/key ending in.*1234/i)).toBeDefined();
    });
    await user.click(screen.getByRole("button", { name: /^remove$/i }));

    await waitFor(() => {
      expect(getStandardTab().getAttribute("data-state")).toBe("active");
    });
    expect(screen.queryByPlaceholderText(/search models/i)).toBeNull();
  });
});

// ── Sticky pendingModel ──────────────────────────────────────────────────

describe("dialog reset on close+reopen", () => {
  it("closing and reopening the dialog resets pendingModel and re-derives mode from server state", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({ preferred_model: "meta-llama/llama-4-scout" }),
    );

    const user = setupUser();
    // 1. Render open with standard mode + saved Llama
    const { rerender } = render(
      <ModelSettingsDialog open onOpenChange={() => {}} />,
      { wrapper: makeWrapper() },
    );

    // 2. Wait for dialog to load and verify Standard tab is active
    await waitFor(() => {
      expect(getStandardTab().getAttribute("data-state")).toBe("active");
    });

    // 3. Pick a different standard radio (sets pendingModel)
    const nemotronRadio = screen.getByRole("radio", { name: /nemotron/i });
    await user.click(nemotronRadio);

    // 4. Verify Save is enabled (pendingModel is dirty)
    const saveBtn = screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    // 5. Close the dialog (open=false)
    rerender(<ModelSettingsDialog open={false} onOpenChange={() => {}} />);

    // 6. Re-open the dialog (open=true)
    rerender(<ModelSettingsDialog open onOpenChange={() => {}} />);

    // 7. Save should be disabled (pendingModel reset)
    await waitFor(() => {
      const saveBtnAfter = screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement;
      expect(saveBtnAfter.disabled).toBe(true);
    });

    // 8. Standard tab still active and original Llama radio is checked
    expect(getStandardTab().getAttribute("data-state")).toBe("active");
    const llamaRadio = screen.getByRole("radio", { name: /llama 4 scout/i });
    expect(llamaRadio.getAttribute("aria-checked")).toBe("true");

    // 9. The discarded pick (Nemotron) is NOT checked
    const nemotronRadioAfter = screen.getByRole("radio", { name: /nemotron/i });
    expect(nemotronRadioAfter.getAttribute("aria-checked")).not.toBe("true");
  });
});

describe("ModelSettingsDialog — sticky pendingModel under refetch", () => {
  it("a background settings refetch does not overwrite an in-flight model pick", async () => {
    let getCallCount = 0;
    vi.spyOn(settingsService, "getSettings").mockImplementation(async () => {
      getCallCount += 1;
      return makeSettings({
        has_api_key: true,
        key_hint: "1234",
        preferred_model: "anthropic/claude-sonnet-4.6",
        balance: { ...healthyBalance(), balance_remaining: 8.52 - getCallCount * 0.1 },
      });
    });
    const searchResults: SearchModel[] = [
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        provider: "OpenAI",
        context_length: 128000,
        is_free: false,
      },
    ];
    vi.spyOn(settingsService, "searchModels").mockResolvedValue(searchResults);

    const user = setupUser();
    const { rerender } = renderDialog();

    const input = await screen.findByPlaceholderText(/search models/i);
    await user.type(input, "gpt-4o");
    await waitFor(
      () => {
        expect(screen.getByRole("option", { name: /gpt-4o/i })).toBeDefined();
      },
      { timeout: 2000 },
    );
    await user.click(screen.getByRole("option", { name: /gpt-4o/i }));

    // Force a re-render that mimics a background refetch landing
    rerender(<ModelSettingsDialog open onOpenChange={() => {}} />);

    // pendingModel should still be GPT-4o, NOT reset to claude — verified
    // via the Selected row and the still-enabled Save button.
    const selected = screen.getByTestId("selected-model-display");
    expect(selected.textContent).toMatch(/openai\/gpt-4o/i);
    const saveBtn = screen.getByRole("button", {
      name: /^save$/i,
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
  });
});
