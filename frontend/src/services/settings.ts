import { api } from "./api";

export interface UserSettings {
  preferred_model: string | null;
  has_api_key: boolean;
  available_models: { id: string; name: string; tier: string }[];
}

export interface UserSettingsUpdate {
  preferred_model?: string | null;
  api_key?: string | null;
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
};
