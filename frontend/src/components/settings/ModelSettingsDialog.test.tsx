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

const DEFAULT_STANDARD_MODEL = "deepseek/deepseek-chat-v3-0324";

function makeSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    preferred_model: null,
    model_tier: "included",
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

function zeroBalance(): BalanceInfo {
  return {
    total_credits: 5,
    total_usage: 5,
    balance_remaining: 0,
    is_free_tier: false,
    key_label: "sk-or-v1-abc...xyz",
    key_limit: null,
    key_limit_remaining: null,
    has_credits: false,
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

// ── Initialization ──────────────────────────────────────────────────────

describe("ModelSettingsDialog — initialization", () => {
  it("opens with included radio selected when model_tier='included' and preferred_model is a standard model", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "included",
        preferred_model: "meta-llama/llama-4-scout",
      }),
    );
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("Model Settings")).toBeDefined();
    });

    // The included radio for Llama 4 Scout should be checked
    const llamaRadio = screen.getByRole("radio", { name: /llama 4 scout/i });
    expect(llamaRadio.getAttribute("aria-checked")).toBe("true");

    // No API key on file, so BYOK section shows add-key form (no model display)
    expect(screen.queryByTestId("selected-model-display")).toBeNull();
    // The add-key form should be visible in the BYOK section
    expect(screen.getByPlaceholderText(/sk-or-v1/i)).toBeDefined();
  });

  it("opens with BYOK model displayed when model_tier='byok' and preferred_model is a premium model", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "byok",
        preferred_model: "anthropic/claude-sonnet-4.6",
        has_api_key: true,
        key_hint: "1234",
        balance: healthyBalance(),
      }),
    );
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("Model Settings")).toBeDefined();
    });

    // BYOK section shows the premium model
    const selectedDisplay = screen.getByTestId("selected-model-display");
    expect(selectedDisplay.textContent).toMatch(/anthropic\/claude-sonnet-4\.6/i);

    // Included radios should NOT have any checked
    const radios = screen.getAllByRole("radio");
    for (const radio of radios) {
      expect(radio.getAttribute("aria-checked")).not.toBe("true");
    }
  });

  it("falls back to 'included' when model_tier is missing from settings", async () => {
    // Simulate a settings response where model_tier is absent (old backend)
    const settingsWithoutTier = makeSettings({
      preferred_model: "meta-llama/llama-4-scout",
    });
    // Remove model_tier to simulate missing field
    delete (settingsWithoutTier as Record<string, unknown>).model_tier;

    vi.spyOn(settingsService, "getSettings").mockResolvedValue(settingsWithoutTier);
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("Model Settings")).toBeDefined();
    });

    // Should default to included — Llama radio selected
    const llamaRadio = screen.getByRole("radio", { name: /llama 4 scout/i });
    expect(llamaRadio.getAttribute("aria-checked")).toBe("true");
  });
});

// ── Mutual exclusion ────────────────────────────────────────────────────

describe("ModelSettingsDialog — mutual exclusion", () => {
  it("clicking an included radio deselects BYOK (model display shows dash)", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "byok",
        preferred_model: "anthropic/claude-sonnet-4.6",
        has_api_key: true,
        key_hint: "1234",
        balance: healthyBalance(),
      }),
    );

    const user = setupUser();
    renderDialog();

    // Wait for BYOK model to be shown
    await waitFor(() => {
      const selected = screen.getByTestId("selected-model-display");
      expect(selected.textContent).toMatch(/anthropic\/claude-sonnet-4\.6/i);
    });

    // Click an included radio
    await user.click(screen.getByRole("radio", { name: /deepseek/i }));

    // BYOK model display should now show "—"
    const selected = screen.getByTestId("selected-model-display");
    expect(selected.textContent).toContain("\u2014");

    // The included radio should be checked
    expect(
      screen.getByRole("radio", { name: /deepseek/i }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("selecting from BYOK combobox deselects included radios", async () => {
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
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "included",
        preferred_model: "meta-llama/llama-4-scout",
        has_api_key: true,
        key_hint: "1234",
        balance: healthyBalance(),
      }),
    );

    const user = setupUser();
    renderDialog();

    // Wait for included radio to be checked
    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: /llama 4 scout/i }).getAttribute("aria-checked"),
      ).toBe("true");
    });

    // Search and pick from BYOK combobox
    const input = screen.getByPlaceholderText(/search models/i);
    await user.type(input, "gpt-4o");
    await waitFor(
      () => {
        expect(screen.getByRole("option", { name: /gpt-4o/i })).toBeDefined();
      },
      { timeout: 2000 },
    );
    await user.click(screen.getByRole("option", { name: /gpt-4o/i }));

    // Included radios should all be unchecked
    await waitFor(() => {
      const radios = screen.getAllByRole("radio");
      for (const radio of radios) {
        expect(radio.getAttribute("aria-checked")).not.toBe("true");
      }
    });

    // BYOK display should show the picked model
    const selected = screen.getByTestId("selected-model-display");
    expect(selected.textContent).toMatch(/openai\/gpt-4o/i);
  });

  it("rapid switching: included -> BYOK -> included -> final state is included with correct model", async () => {
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
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "included",
        preferred_model: "meta-llama/llama-4-scout",
        has_api_key: true,
        key_hint: "1234",
        balance: healthyBalance(),
      }),
    );

    const user = setupUser();
    renderDialog();

    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: /llama 4 scout/i }).getAttribute("aria-checked"),
      ).toBe("true");
    });

    // Step 1: Pick from BYOK
    const input = screen.getByPlaceholderText(/search models/i);
    await user.type(input, "gpt-4o");
    await waitFor(
      () => {
        expect(screen.getByRole("option", { name: /gpt-4o/i })).toBeDefined();
      },
      { timeout: 2000 },
    );
    await user.click(screen.getByRole("option", { name: /gpt-4o/i }));

    // Step 2: Switch back to included by clicking DeepSeek radio
    await user.click(screen.getByRole("radio", { name: /deepseek/i }));

    // Final: DeepSeek should be selected, BYOK cleared
    expect(
      screen.getByRole("radio", { name: /deepseek/i }).getAttribute("aria-checked"),
    ).toBe("true");
    const selected = screen.getByTestId("selected-model-display");
    expect(selected.textContent).toContain("\u2014");
  });
});

// ── Save behavior ───────────────────────────────────────────────────────

describe("ModelSettingsDialog — save behavior", () => {
  it("save sends { modelId, modelTier: 'included' } when included model selected", async () => {
    const updateSpy = vi
      .spyOn(settingsService, "updatePreferredModel")
      .mockResolvedValue(
        makeSettings({
          model_tier: "included",
          preferred_model: "deepseek/deepseek-chat-v3-0324",
        }),
      );
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "included",
        preferred_model: "meta-llama/llama-4-scout",
      }),
    );

    const user = setupUser();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /deepseek/i })).toBeDefined();
    });
    await user.click(screen.getByRole("radio", { name: /deepseek/i }));

    const saveBtn = screen.getByRole("button", { name: /^save$/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
    await user.click(saveBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({
        modelId: "deepseek/deepseek-chat-v3-0324",
        modelTier: "included",
      });
    });
  });

  it("save sends { modelId, modelTier: 'byok' } when BYOK model selected", async () => {
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
          model_tier: "byok",
          preferred_model: "openai/gpt-4o",
          has_api_key: true,
          key_hint: "1234",
          balance: healthyBalance(),
        }),
      );
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "included",
        preferred_model: "meta-llama/llama-4-scout",
        has_api_key: true,
        key_hint: "1234",
        balance: healthyBalance(),
      }),
    );

    const user = setupUser();
    renderDialog();

    // Pick a BYOK model
    const input = await screen.findByPlaceholderText(/search models/i);
    await user.type(input, "gpt-4o");
    await waitFor(
      () => {
        expect(screen.getByRole("option", { name: /gpt-4o/i })).toBeDefined();
      },
      { timeout: 2000 },
    );
    await user.click(screen.getByRole("option", { name: /gpt-4o/i }));

    const saveBtn = screen.getByRole("button", { name: /^save$/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({
        modelId: "openai/gpt-4o",
        modelTier: "byok",
      });
    });
  });

  it("save disabled when nothing changed (not dirty)", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "included",
        preferred_model: "meta-llama/llama-4-scout",
      }),
    );
    renderDialog();

    await waitFor(() => {
      const saveBtn = screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });
  });

  it("save disabled when BYOK selected but no API key on file", async () => {
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
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "included",
        preferred_model: "meta-llama/llama-4-scout",
        has_api_key: false, // no key
      }),
    );

    renderDialog();

    // Since there's no API key, BYOK section shows the add-key form.
    // The user can't select a BYOK model without a key, so Save should
    // remain disabled — the combobox isn't mounted without a key.
    await waitFor(() => {
      expect(screen.getByText("Model Settings")).toBeDefined();
    });

    // Save should still be disabled (no change from initial state)
    const saveBtn = screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it("save disabled when BYOK selected and balance is $0", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "byok",
        preferred_model: "anthropic/claude-sonnet-4.6",
        has_api_key: true,
        key_hint: "1234",
        balance: zeroBalance(),
      }),
    );
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("Model Settings")).toBeDefined();
    });

    // Save should be disabled when BYOK tier is active with $0 balance
    const saveBtn = screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });
});

// ── BYOK section ────────────────────────────────────────────────────────

describe("ModelSettingsDialog — BYOK section", () => {
  it("shows add-key form when no API key", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "included",
        preferred_model: "meta-llama/llama-4-scout",
        has_api_key: false,
      }),
    );
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("Model Settings")).toBeDefined();
    });

    // BYOK section should show the add-key input
    expect(screen.getByPlaceholderText(/sk-or-v1/i)).toBeDefined();
    // No combobox search input when key is absent
    expect(screen.queryByPlaceholderText(/search models/i)).toBeNull();
  });

  it("shows key hint + balance + combobox when API key exists", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "included",
        preferred_model: "meta-llama/llama-4-scout",
        has_api_key: true,
        key_hint: "1234",
        balance: healthyBalance(),
      }),
    );
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("Model Settings")).toBeDefined();
    });

    // Key hint is visible
    expect(screen.getByText(/1234/)).toBeDefined();
    // Balance is visible
    expect(screen.getByText(/8\.52/)).toBeDefined();
    // Combobox is mounted
    expect(screen.getByPlaceholderText(/search models/i)).toBeDefined();
  });

  it("remove key switches to included tier with default model", async () => {
    vi.spyOn(settingsService, "deleteApiKey").mockResolvedValue();
    vi.spyOn(settingsService, "getSettings")
      .mockResolvedValueOnce(
        makeSettings({
          model_tier: "byok",
          preferred_model: "anthropic/claude-sonnet-4.6",
          has_api_key: true,
          key_hint: "1234",
          balance: healthyBalance(),
        }),
      )
      .mockResolvedValue(
        makeSettings({
          model_tier: "included",
          preferred_model: DEFAULT_STANDARD_MODEL,
          has_api_key: false,
        }),
      );

    const user = setupUser();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/1234/)).toBeDefined();
    });

    // Click remove key
    await user.click(screen.getByRole("button", { name: /remove/i }));

    // After removal, included radios should be visible and the default
    // standard model (DeepSeek V3) selected.
    await waitFor(() => {
      const deepseekRadio = screen.getByRole("radio", { name: /deepseek/i });
      expect(deepseekRadio.getAttribute("aria-checked")).toBe("true");
    });

    // Combobox should be gone (replaced by add-key form)
    expect(screen.queryByPlaceholderText(/search models/i)).toBeNull();
  });

  it("$0 balance shows inline error with 'Add credits' link", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "byok",
        preferred_model: "anthropic/claude-sonnet-4.6",
        has_api_key: true,
        key_hint: "1234",
        balance: zeroBalance(),
      }),
    );
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("Model Settings")).toBeDefined();
    });

    // BalanceDisplay shows "No credits remaining" in the error state
    expect(screen.getByText(/no credits remaining/i)).toBeDefined();

    // "Add credits" link should be present
    const link = screen.getByRole("link", { name: /add credits/i }) as HTMLAnchorElement;
    expect(link).toBeDefined();
    expect(link.href).toContain("openrouter.ai/settings/credits");
  });
});

// ── Error handling ──────────────────────────────────────────────────────

describe("ModelSettingsDialog — error handling", () => {
  it("add key error renders inline", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "included",
        preferred_model: "meta-llama/llama-4-scout",
        has_api_key: false,
      }),
    );
    vi.spyOn(settingsService, "addApiKey").mockRejectedValue({
      response: {
        status: 400,
        data: { detail: "Invalid API key format" },
      },
      message: "Request failed",
    });

    const user = setupUser();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/sk-or-v1/i)).toBeDefined();
    });

    await user.type(
      screen.getByPlaceholderText(/sk-or-v1/i),
      "sk-or-v1-badkey1234",
    );
    await user.click(screen.getByRole("button", { name: /validate/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid api key/i)).toBeDefined();
    });
  });

  it("update model error renders inline", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "included",
        preferred_model: "meta-llama/llama-4-scout",
      }),
    );
    vi.spyOn(settingsService, "updatePreferredModel").mockRejectedValue({
      response: {
        status: 500,
        data: { detail: "Internal server error" },
      },
      message: "Request failed",
    });

    const user = setupUser();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /deepseek/i })).toBeDefined();
    });
    await user.click(screen.getByRole("radio", { name: /deepseek/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByText(/internal server error/i)).toBeDefined();
    });
  });
});

// ── Key management ──────────────────────────────────────────────────────

describe("ModelSettingsDialog — key management", () => {
  it("BYOK section is dimmed (opacity) when included tier is active", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValue(
      makeSettings({
        model_tier: "included",
        preferred_model: "meta-llama/llama-4-scout",
        has_api_key: true,
        key_hint: "1234",
        balance: healthyBalance(),
      }),
    );
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("Model Settings")).toBeDefined();
    });

    // The BYOK section should have opacity-75 when included is the active tier
    const byokSection = screen.getByTestId("byok-section");
    expect(byokSection.className).toMatch(/opacity-75/);
  });

  it("key can still be managed (added/removed) even when included tier is active", async () => {
    vi.spyOn(settingsService, "deleteApiKey").mockResolvedValue();
    let currentSettings = makeSettings({
      model_tier: "included",
      preferred_model: "deepseek/deepseek-chat-v3-0324",
      has_api_key: true,
      key_hint: "1234",
      balance: healthyBalance(),
    });
    vi.spyOn(settingsService, "getSettings").mockImplementation(
      async () => currentSettings,
    );

    const user = setupUser();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/1234/)).toBeDefined();
    });

    // Included radio should be checked (included tier is active)
    const deepseekRadio = screen.getByRole("radio", { name: /deepseek/i });
    expect(deepseekRadio.getAttribute("aria-checked")).toBe("true");

    // But the "Remove" button in BYOK section should still be clickable
    const removeBtn = screen.getByRole("button", { name: /remove/i });
    expect((removeBtn as HTMLButtonElement).disabled).toBe(false);

    // After removal, the add-key form should appear
    currentSettings = makeSettings({
      model_tier: "included",
      preferred_model: "deepseek/deepseek-chat-v3-0324",
      has_api_key: false,
    });
    await user.click(removeBtn);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/sk-or-v1/i)).toBeDefined();
    });

    // Included radios should still be selected — removing key doesn't change tier
    expect(
      screen.getByRole("radio", { name: /deepseek/i }).getAttribute("aria-checked"),
    ).toBe("true");
  });
});
