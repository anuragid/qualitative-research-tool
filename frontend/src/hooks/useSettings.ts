import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsService } from "../services/settings";
import type { UserSettingsUpdate } from "../services/settings";

export function useSettings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["user-settings"],
    queryFn: settingsService.getSettings,
  });

  const updateMutation = useMutation({
    mutationFn: (settings: UserSettingsUpdate) =>
      settingsService.updateSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: settingsService.deleteApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    updateSettings: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    deleteApiKey: deleteKeyMutation.mutate,
    isDeletingKey: deleteKeyMutation.isPending,
  };
}
