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
import type { UserSettings } from "./settings";
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

  describe("addApiKey", () => {
    it("POSTs to /api/users/settings/api-key with the key", async () => {
      const updatedSettings: UserSettings = {
        ...mockSettings,
        has_api_key: true,
        key_hint: "1234",
        key_validated_at: "2026-04-06T12:00:00Z",
        balance: {
          total_credits: 10,
          total_usage: 1.48,
          balance_remaining: 8.52,
          has_credits: true,
          is_free_tier: false,
          checked_at: "2026-04-06T12:00:00Z",
          stale: false,
        } as BalanceInfo,
      };
      mockedApi.post.mockResolvedValue({ data: updatedSettings });

      const result = await settingsService.addApiKey("sk-or-v1-test1234");

      expect(mockedApi.post).toHaveBeenCalledWith("/api/users/settings/api-key", {
        api_key: "sk-or-v1-test1234",
      });
      expect(result.has_api_key).toBe(true);
      expect(result.balance?.balance_remaining).toBe(8.52);
    });

    it("propagates 400 errors from the server", async () => {
      mockedApi.post.mockRejectedValue({
        response: { status: 400, data: { detail: "Your OpenRouter key has $0 credits..." } },
      });

      await expect(
        settingsService.addApiKey("sk-or-v1-empty1234"),
      ).rejects.toMatchObject({ response: { status: 400 } });
    });
  });

  describe("updatePreferredModel", () => {
    it("PUTs to /api/users/settings/preferred-model", async () => {
      const updatedSettings: UserSettings = {
        ...mockSettings,
        preferred_model: "anthropic/claude-sonnet-4.6",
        has_api_key: true,
        key_hint: "1234",
        key_validated_at: "2026-04-06T12:00:00Z",
      };
      mockedApi.put.mockResolvedValue({ data: updatedSettings });

      const result = await settingsService.updatePreferredModel(
        "anthropic/claude-sonnet-4.6",
      );

      expect(mockedApi.put).toHaveBeenCalledWith(
        "/api/users/settings/preferred-model",
        { preferred_model: "anthropic/claude-sonnet-4.6" },
      );
      expect(result.preferred_model).toBe("anthropic/claude-sonnet-4.6");
    });
  });

  describe("removed updateSettings", () => {
    it("no longer exists on the service surface", () => {
      // @ts-expect-error - updateSettings is removed
      expect(settingsService.updateSettings).toBeUndefined();
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
