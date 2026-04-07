import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsService } from "../services/settings";
import type { UserSettings, UserSettingsUpdate } from "../services/settings";
import type { BalanceInfo } from "../types";

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

  /**
   * Force-refresh the user's OpenRouter balance.
   *
   * On success, merges the fresh `BalanceInfo` into the cached `user-settings`
   * query so consumers re-render without a full refetch round-trip.
   */
  const refreshBalanceMutation = useMutation<BalanceInfo, Error, void>({
    mutationFn: () => settingsService.refreshBalance(),
    onSuccess: (balance) => {
      queryClient.setQueryData<UserSettings | undefined>(
        ["user-settings"],
        (prev) => (prev ? { ...prev, balance } : prev),
      );
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
    /** Returns the fresh balance via the mutation's promise. */
    refreshBalance: refreshBalanceMutation.mutateAsync,
    isRefreshingBalance: refreshBalanceMutation.isPending,
    refreshBalanceError: refreshBalanceMutation.error,
  };
}
