import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { analysisService } from "../services/analysis";

// Video Analysis Hooks
export function useVideoAnalysis(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "analysis"],
    queryFn: () => analysisService.getVideoAnalysis(videoId!),
    enabled: !!videoId,
    refetchInterval: (query) => {
      const analysis = query.state.data;
      // Poll while analysis is running
      if (analysis && analysis.status === "running") {
        return 3000; // Poll every 3 seconds
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

export function useVideoChunks(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "chunks"],
    queryFn: () => analysisService.getVideoChunks(videoId!),
    enabled: !!videoId,
  });
}

export function useVideoInferences(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "inferences"],
    queryFn: () => analysisService.getVideoInferences(videoId!),
    enabled: !!videoId,
  });
}

export function useVideoPatterns(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "patterns"],
    queryFn: () => analysisService.getVideoPatterns(videoId!),
    enabled: !!videoId,
  });
}

export function useVideoInsights(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "insights"],
    queryFn: () => analysisService.getVideoInsights(videoId!),
    enabled: !!videoId,
  });
}

export function useVideoPrinciples(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "principles"],
    queryFn: () => analysisService.getVideoPrinciples(videoId!),
    enabled: !!videoId,
  });
}

// Project Analysis Hooks (Cross-Video)
export function useProjectAnalysis(projectId: string | null) {
  return useQuery({
    queryKey: ["projects", projectId, "analysis"],
    queryFn: () => analysisService.getProjectAnalysis(projectId!),
    enabled: !!projectId,
    refetchInterval: (query) => {
      const analysis = query.state.data;
      // Poll while analysis is running
      if (analysis && analysis.status === "running") {
        return 3000; // Poll every 3 seconds
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
      queryClient.invalidateQueries({
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

// Task Monitoring
export function useTaskStatus(taskId: string | null) {
  return useQuery({
    queryKey: ["tasks", taskId],
    queryFn: () => analysisService.getTaskStatus(taskId!),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const task = query.state.data;
      // Poll while task is running
      if (task && (task.status === "pending" || task.status === "running")) {
        return 2000; // Poll every 2 seconds
      }
      return false;
    },
  });
}
