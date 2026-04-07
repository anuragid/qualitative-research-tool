import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsService } from "../services/settings";
import type { UserSettings } from "../services/settings";
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

  /** Add or replace the BYOK key. On success, writes the fresh settings into the cache. */
  const addApiKeyMutation = useMutation<UserSettings, Error, string>({
    mutationFn: (apiKey: string) => settingsService.addApiKey(apiKey),
    onSuccess: (data) => {
      queryClient.setQueryData<UserSettings>(["user-settings"], data);
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });

  /** Set the preferred model. On success, writes the fresh settings into the cache. */
  const updatePreferredModelMutation = useMutation<UserSettings, Error, string>({
    mutationFn: (modelId: string) =>
      settingsService.updatePreferredModel(modelId),
    onSuccess: (data) => {
      queryClient.setQueryData<UserSettings>(["user-settings"], data);
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

    addApiKey: addApiKeyMutation.mutateAsync,
    isAddingKey: addApiKeyMutation.isPending,
    addKeyError: addApiKeyMutation.error,
    resetAddKeyError: addApiKeyMutation.reset,

    updatePreferredModel: updatePreferredModelMutation.mutateAsync,
    isUpdatingModel: updatePreferredModelMutation.isPending,
    updateModelError: updatePreferredModelMutation.error,
    resetUpdateModelError: updatePreferredModelMutation.reset,

    deleteApiKey: deleteKeyMutation.mutateAsync,
    isDeletingKey: deleteKeyMutation.isPending,
    deleteKeyError: deleteKeyMutation.error,
    resetDeleteKeyError: deleteKeyMutation.reset,

    /** Returns the fresh balance via the mutation's promise. */
    refreshBalance: refreshBalanceMutation.mutateAsync,
    isRefreshingBalance: refreshBalanceMutation.isPending,
    refreshBalanceError: refreshBalanceMutation.error,
  };
}
