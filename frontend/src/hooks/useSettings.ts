import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsService } from "../services/settings";
import type { UserSettingsUpdate } from "../services/settings";

export function useSettings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["user-settings"],
    queryFn: settingsService.getSettings,
  });

  const recommendedQuery = useQuery({
    queryKey: ["recommended-models"],
    queryFn: settingsService.getRecommendedModels,
    staleTime: 5 * 60 * 1000, // 5 minutes — these rarely change
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
    recommended: recommendedQuery.data,
    isLoadingRecommended: recommendedQuery.isLoading,
    updateSettings: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    resetUpdateError: updateMutation.reset,
    deleteApiKey: deleteKeyMutation.mutate,
    isDeletingKey: deleteKeyMutation.isPending,
  };
}
