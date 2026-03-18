import { api } from "./api";

export interface UserSettings {
  preferred_model: string | null;
  has_api_key: boolean;
  key_hint: string | null;
  key_validated_at: string | null;
  available_models: { id: string; name: string; tier: string }[];
}

export interface UserSettingsUpdate {
  preferred_model?: string | null;
  api_key?: string | null;
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

  updateSettings: async (settings: UserSettingsUpdate): Promise<UserSettings> => {
    const response = await api.put("/api/users/settings", settings);
    return response.data;
  },

  deleteApiKey: async (): Promise<void> => {
    await api.delete("/api/users/settings/api-key");
  },

  getRecommendedModels: async (): Promise<RecommendedModels> => {
    const response = await api.get("/api/models/recommended");
    return response.data;
  },

  searchModels: async (query: string): Promise<SearchModel[]> => {
    const response = await api.get("/api/models/search", {
      params: { q: query },
    });
    return response.data;
  },
};
