import { api } from "./api";
import type { BalanceInfo } from "../types";

export type ModelTier = "included" | "byok";

export interface UserSettings {
  preferred_model: string | null;
  /** Which section the user's model selection belongs to. Defaults to "included". */
  model_tier?: ModelTier;
  has_api_key: boolean;
  key_hint: string | null;
  key_validated_at: string | null;
  available_models: { id: string; name: string; tier: string; provider?: string }[];
  /** OpenRouter balance for BYOK users. `null` for non-BYOK users or when never refreshed. */
  balance?: BalanceInfo | null;
  /**
   * Backend-configured low-balance threshold in USD. Used by `BalanceDisplay`
   * to decide when to show the yellow warning state. Optional — falls back
   * to the hardcoded $0.50 default in the component if absent.
   */
  low_balance_threshold_usd?: number;
}

export interface RecommendedModel {
  id: string;
  name: string;
  description: string;
}

export interface RecommendedModels {
  standard: RecommendedModel;
  advanced: RecommendedModel;
}

export interface SearchModel {
  id: string;
  name: string;
  provider: string;
  context_length: number | null;
  is_free: boolean;
}

export const settingsService = {
  getSettings: async (): Promise<UserSettings> => {
    const response = await api.get("/api/users/settings");
    return response.data;
  },

  /** Add or replace the user's BYOK key. Validates + balance-checks server-side. */
  addApiKey: async (apiKey: string): Promise<UserSettings> => {
    const response = await api.post("/api/users/settings/api-key", {
      api_key: apiKey,
    });
    return response.data;
  },

  /** Set the user's preferred model and tier. Server enforces tier constraints. */
  updatePreferredModel: async (payload: {
    modelId: string;
    modelTier: ModelTier;
  }): Promise<UserSettings> => {
    const response = await api.put("/api/users/settings/preferred-model", {
      preferred_model: payload.modelId,
      model_tier: payload.modelTier,
    });
    return response.data;
  },

  deleteApiKey: async (): Promise<void> => {
    await api.delete("/api/users/settings/api-key");
  },

  /**
   * Force-refresh the OpenRouter balance for the current user from upstream.
   *
   * Backed by `POST /api/users/settings/refresh-balance` (added by Worktree A).
   * Rate-limited to 10 requests/minute/user — callers should expect 429s
   * during pathological polling.
   */
  refreshBalance: async (): Promise<BalanceInfo> => {
    const response = await api.post("/api/users/settings/refresh-balance");
    return response.data;
  },

  getRecommendedModels: async (): Promise<RecommendedModels> => {
    const response = await api.get("/api/models/recommended");
    return response.data;
  },

  searchModels: async (query: string, freeOnly?: boolean): Promise<SearchModel[]> => {
    const response = await api.get("/api/models/search", {
      params: {
        q: query,
        ...(freeOnly !== undefined && { free_only: freeOnly }),
      },
    });
    return response.data;
  },
};
