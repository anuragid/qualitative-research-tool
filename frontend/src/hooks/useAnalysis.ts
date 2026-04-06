import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { analysisService } from "../services/analysis";
import { useBackoffInterval } from "./useBackoffInterval";

// Video Analysis Status Hook (lightweight polling endpoint ~200 bytes)
export function useVideoAnalysisStatus(videoId: string | null) {
  const getInterval = useBackoffInterval({
    initialMs: 3000,
    maxMs: 15000,
    growEvery: 6,
  });
  return useQuery({
    queryKey: ["videos", videoId, "analysis", "status"],
    queryFn: () => analysisService.getVideoAnalysisStatus(videoId!),
    enabled: !!videoId,
    retry: (failureCount, error: unknown) => {
      const status = (error as { status?: number })?.status;
      // Retry 404s a couple of times to handle the race condition where
      // startVideoAnalysis has been called but the backend hasn't created
      // the analysis record yet.
      if (status === 404) return failureCount < 2;
      return failureCount < 3;
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll while processing or pending; stop for completed, error, or no data
      const shouldPoll = !!(
        data && (data.status === "processing" || data.status === "pending")
      );
      return getInterval(shouldPoll);
    },
  });
}

// Video Analysis Hook (full payload, no polling — use useVideoAnalysisStatus for polling)
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
  });
}

export function useStartVideoAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (videoId: string) => analysisService.startVideoAnalysis(videoId),
    onSuccess: (_, videoId) => {
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis", "status"] });
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
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis", "status"] });
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
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis", "status"] });
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
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis", "status"] });
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
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis", "status"] });
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
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis", "status"] });
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis"] });
      queryClient.invalidateQueries({ queryKey: ["videos", videoId] });
    },
  });
}

// Project Analysis Hooks (Cross-Video)
export function useProjectAnalysis(projectId: string | null) {
  const getInterval = useBackoffInterval({
    initialMs: 5000,
    maxMs: 15000,
    growEvery: 4,
  });
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
      const shouldPoll = !!(
        analysis &&
        (analysis.status === "processing" || analysis.status === "pending")
      );
      return getInterval(shouldPoll);
    },
  });
}

export function useStartProjectAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) =>
      analysisService.startProjectAnalysis(projectId),
    onSuccess: (_, projectId) => {
      // Force immediate refetch to get the "processing" status
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "analysis"],
      });
      queryClient.refetchQueries({
        queryKey: ["projects", projectId, "analysis"],
      });
    },
  });
}

// These hooks share the same queryKey as useProjectAnalysis so React Query
// deduplicates the request — one fetch, three derived views via `select`.
export function useMetaPatterns(projectId: string | null) {
  return useQuery({
    queryKey: ["projects", projectId, "analysis"],
    queryFn: () => analysisService.getProjectAnalysis(projectId!),
    enabled: !!projectId,
    select: (data) => data?.cross_video_patterns ?? null,
    retry: (failureCount, error: unknown) => {
      if ((error as { status?: number })?.status === 404) return false;
      return failureCount < 3;
    },
  });
}

export function useCrossInsights(projectId: string | null) {
  return useQuery({
    queryKey: ["projects", projectId, "analysis"],
    queryFn: () => analysisService.getProjectAnalysis(projectId!),
    enabled: !!projectId,
    select: (data) => data?.cross_video_insights ?? null,
    retry: (failureCount, error: unknown) => {
      if ((error as { status?: number })?.status === 404) return false;
      return failureCount < 3;
    },
  });
}

export function useSystemPrinciples(projectId: string | null) {
  return useQuery({
    queryKey: ["projects", projectId, "analysis"],
    queryFn: () => analysisService.getProjectAnalysis(projectId!),
    enabled: !!projectId,
    select: (data) => data?.cross_video_principles ?? null,
    retry: (failureCount, error: unknown) => {
      if ((error as { status?: number })?.status === 404) return false;
      return failureCount < 3;
    },
  });
}

