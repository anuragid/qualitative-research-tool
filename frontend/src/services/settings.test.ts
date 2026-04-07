import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./api", () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  return { default: mockApi, api: mockApi };
});

import { api } from "./api";
import { settingsService } from "./settings";
import type { UserSettings, UserSettingsUpdate } from "./settings";
import type { BalanceInfo } from "../types";

const mockedApi = vi.mocked(api);

const mockBalance: BalanceInfo = {
  total_credits: 10,
  total_usage: 2.75,
  balance_remaining: 7.25,
  is_free_tier: false,
  key_label: "sk-or-v1-abc...xyz",
  key_limit: null,
  key_limit_remaining: null,
  has_credits: true,
  checked_at: "2026-04-06T22:00:00Z",
  stale: false,
};

const mockSettings: UserSettings = {
  preferred_model: "openai/gpt-4",
  has_api_key: true,
  available_models: [
    { id: "openai/gpt-4", name: "GPT-4", tier: "premium" },
    { id: "openai/gpt-3.5-turbo", name: "GPT-3.5", tier: "free" },
  ],
};

describe("settingsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSettings", () => {
    it("fetches user settings from /api/users/settings", async () => {
      mockedApi.get.mockResolvedValue({ data: mockSettings });

      const result = await settingsService.getSettings();

      expect(mockedApi.get).toHaveBeenCalledWith("/api/users/settings");
      expect(result).toEqual(mockSettings);
    });

    it("returns settings with null preferred_model", async () => {
      const settings: UserSettings = {
        ...mockSettings,
        preferred_model: null,
        has_api_key: false,
      };
      mockedApi.get.mockResolvedValue({ data: settings });

      const result = await settingsService.getSettings();

      expect(result.preferred_model).toBeNull();
      expect(result.has_api_key).toBe(false);
    });

    it("propagates errors from api", async () => {
      mockedApi.get.mockRejectedValue({ status: 401, message: "Unauthorized" });

      await expect(settingsService.getSettings()).rejects.toEqual({
        status: 401,
        message: "Unauthorized",
      });
    });
  });

  describe("updateSettings", () => {
    it("puts updated settings to /api/users/settings", async () => {
      const update: UserSettingsUpdate = {
        preferred_model: "anthropic/claude-3",
      };
      const updatedSettings: UserSettings = {
        ...mockSettings,
        preferred_model: "anthropic/claude-3",
      };
      mockedApi.put.mockResolvedValue({ data: updatedSettings });

      const result = await settingsService.updateSettings(update);

      expect(mockedApi.put).toHaveBeenCalledWith("/api/users/settings", update);
      expect(result.preferred_model).toBe("anthropic/claude-3");
    });

    it("updates api_key", async () => {
      const update: UserSettingsUpdate = { api_key: "sk-test-key-123" };
      const updatedSettings: UserSettings = {
        ...mockSettings,
        has_api_key: true,
      };
      mockedApi.put.mockResolvedValue({ data: updatedSettings });

      const result = await settingsService.updateSettings(update);

      expect(mockedApi.put).toHaveBeenCalledWith("/api/users/settings", update);
      expect(result.has_api_key).toBe(true);
    });

    it("clears preferred_model by setting to null", async () => {
      const update: UserSettingsUpdate = { preferred_model: null };
      const updatedSettings: UserSettings = {
        ...mockSettings,
        preferred_model: null,
      };
      mockedApi.put.mockResolvedValue({ data: updatedSettings });

      const result = await settingsService.updateSettings(update);

      expect(mockedApi.put).toHaveBeenCalledWith("/api/users/settings", update);
      expect(result.preferred_model).toBeNull();
    });

    it("propagates errors from api", async () => {
      mockedApi.put.mockRejectedValue({ status: 500, message: "Server error" });

      await expect(
        settingsService.updateSettings({ preferred_model: "test" })
      ).rejects.toEqual({
        status: 500,
        message: "Server error",
      });
    });
  });

  describe("refreshBalance", () => {
    it("posts to /api/users/settings/refresh-balance and returns BalanceInfo", async () => {
      mockedApi.post.mockResolvedValue({ data: mockBalance });

      const result = await settingsService.refreshBalance();

      expect(mockedApi.post).toHaveBeenCalledWith(
        "/api/users/settings/refresh-balance",
      );
      expect(result).toEqual(mockBalance);
    });

    it("propagates 429 rate-limit errors from api", async () => {
      mockedApi.post.mockRejectedValue({
        status: 429,
        message: "Too Many Requests",
      });

      await expect(settingsService.refreshBalance()).rejects.toEqual({
        status: 429,
        message: "Too Many Requests",
      });
    });

    it("propagates 503 OpenRouter unreachable errors from api", async () => {
      mockedApi.post.mockRejectedValue({
        status: 503,
        message: "Service Unavailable",
      });

      await expect(settingsService.refreshBalance()).rejects.toEqual({
        status: 503,
        message: "Service Unavailable",
      });
    });
  });

  describe("getSettings (with balance)", () => {
    it("returns settings with balance field for BYOK users", async () => {
      const settings: UserSettings = {
        ...mockSettings,
        balance: mockBalance,
      };
      mockedApi.get.mockResolvedValue({ data: settings });

      const result = await settingsService.getSettings();

      expect(result.balance).toEqual(mockBalance);
    });

    it("returns settings with null balance for non-BYOK users", async () => {
      const settings: UserSettings = {
        ...mockSettings,
        has_api_key: false,
        balance: null,
      };
      mockedApi.get.mockResolvedValue({ data: settings });

      const result = await settingsService.getSettings();

      expect(result.balance).toBeNull();
    });
  });

  describe("deleteApiKey", () => {
    it("deletes api key via /api/users/settings/api-key", async () => {
      mockedApi.delete.mockResolvedValue({});

      await settingsService.deleteApiKey();

      expect(mockedApi.delete).toHaveBeenCalledWith(
        "/api/users/settings/api-key"
      );
    });

    it("propagates errors from api", async () => {
      mockedApi.delete.mockRejectedValue({
        status: 404,
        message: "No API key found",
      });

      await expect(settingsService.deleteApiKey()).rejects.toEqual({
        status: 404,
        message: "No API key found",
      });
    });
  });
});
