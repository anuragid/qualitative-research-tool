import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { analysisService } from "../services/analysis";

// Video Analysis Status Hook (lightweight polling endpoint ~200 bytes)
export function useVideoAnalysisStatus(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "analysis", "status"],
    queryFn: () => analysisService.getVideoAnalysisStatus(videoId!),
    enabled: !!videoId,
    retry: (failureCount, error: unknown) => {
      const status = (error as { status?: number })?.status;
      if (status === 404) return false;
      return failureCount < 3;
    },
    refetchInterval: (query) => {
      if (document.hidden) return false;
      const data = query.state.data;
      // Poll while processing or pending; stop for completed, error, or no data
      if (data && (data.status === "processing" || data.status === "pending")) {
        return 3000;
      }
      return false;
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
      if (document.hidden) return false;
      const analysis = query.state.data;
      if (analysis && (analysis.status === "processing" || analysis.status === "pending")) {
        return 10000;
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

