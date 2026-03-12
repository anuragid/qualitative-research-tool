import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { analysisService } from "../services/analysis";

// Video Analysis Hooks
export function useVideoAnalysis(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "analysis"],
    queryFn: () => analysisService.getVideoAnalysis(videoId!),
    enabled: !!videoId,
    retry: (failureCount, error: unknown) => {
      // Don't retry on 404 - analysis doesn't exist yet
      const status = (error as { status?: number })?.status;
      if (status === 404) {
        return false;
      }
      return failureCount < 3;
    },
    refetchInterval: (query) => {
      const analysis = query.state.data;
      // Poll while analysis is running or pending (not for completed/failed)
      if (analysis && (analysis.status === "running" || analysis.status === "pending")) {
        return 1000; // Poll every 1 second for faster updates
      }
      return false;
    },
  });
}

export function useStartVideoAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (videoId: string) => analysisService.startVideoAnalysis(videoId),
    onSuccess: (_, videoId) => {
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis"] });
      queryClient.invalidateQueries({ queryKey: ["videos", videoId] });
    },
  });
}

/**
 * Alias for useStartVideoAnalysis - runs the full (non-step-by-step) analysis.
 * Kept as a separate export for semantic clarity in the VideoDetailPage.
 */
export const useStartFullAnalysis = useStartVideoAnalysis;

// Step-by-step analysis hooks
export function useStartChunkStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (videoId: string) => analysisService.startChunkStep(videoId),
    onSuccess: (_, videoId) => {
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis"] });
      queryClient.invalidateQueries({ queryKey: ["videos", videoId] });
    },
  });
}

export function useStartInferStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (videoId: string) => analysisService.startInferStep(videoId),
    onSuccess: (_, videoId) => {
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis"] });
      queryClient.invalidateQueries({ queryKey: ["videos", videoId] });
    },
  });
}

export function useStartRelateStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (videoId: string) => analysisService.startRelateStep(videoId),
    onSuccess: (_, videoId) => {
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis"] });
      queryClient.invalidateQueries({ queryKey: ["videos", videoId] });
    },
  });
}

export function useStartExplainStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (videoId: string) => analysisService.startExplainStep(videoId),
    onSuccess: (_, videoId) => {
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis"] });
      queryClient.invalidateQueries({ queryKey: ["videos", videoId] });
    },
  });
}

export function useStartActivateStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (videoId: string) => analysisService.startActivateStep(videoId),
    onSuccess: (_, videoId) => {
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis"] });
      queryClient.invalidateQueries({ queryKey: ["videos", videoId] });
    },
  });
}

// Project Analysis Hooks (Cross-Video)
export function useProjectAnalysis(projectId: string | null) {
  return useQuery({
    queryKey: ["projects", projectId, "analysis"],
    queryFn: () => analysisService.getProjectAnalysis(projectId!),
    enabled: !!projectId,
    retry: (failureCount, error: unknown) => {
      // Don't retry on 404 - analysis doesn't exist yet
      const status = (error as { status?: number })?.status;
      if (status === 404) {
        return false;
      }
      return failureCount < 3;
    },
    refetchInterval: (query) => {
      const analysis = query.state.data;
      // Poll while analysis is running or pending
      if (analysis && (analysis.status === "running" || analysis.status === "pending")) {
        return 2000; // Poll every 2 seconds for faster updates
      }
      return false;
    },
  });
}

export function useStartProjectAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) =>
      analysisService.startProjectAnalysis(projectId),
    onSuccess: (_, projectId) => {
      // Force immediate refetch to get the "running" status
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "analysis"],
      });
      queryClient.refetchQueries({
        queryKey: ["projects", projectId, "analysis"],
      });
    },
  });
}

export function useMetaPatterns(projectId: string | null) {
  return useQuery({
    queryKey: ["projects", projectId, "meta-patterns"],
    queryFn: () => analysisService.getMetaPatterns(projectId!),
    enabled: !!projectId,
  });
}

export function useCrossInsights(projectId: string | null) {
  return useQuery({
    queryKey: ["projects", projectId, "cross-insights"],
    queryFn: () => analysisService.getCrossInsights(projectId!),
    enabled: !!projectId,
  });
}

export function useSystemPrinciples(projectId: string | null) {
  return useQuery({
    queryKey: ["projects", projectId, "system-principles"],
    queryFn: () => analysisService.getSystemPrinciples(projectId!),
    enabled: !!projectId,
  });
}

