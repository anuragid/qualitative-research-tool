import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { analysisService } from "../services/analysis";

// Video Analysis Hooks
export function useVideoAnalysis(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "analysis"],
    queryFn: () => analysisService.getVideoAnalysis(videoId!),
    enabled: !!videoId,
    retry: (failureCount, error: any) => {
      // Don't retry on 404 - analysis doesn't exist yet
      if (error?.response?.status === 404) {
        return false;
      }
      return failureCount < 3;
    },
    refetchInterval: (query) => {
      const analysis = query.state.data;
      // Poll while analysis is running OR while in step-by-step mode
      if (analysis && (analysis.status === "running" || analysis.status !== "completed")) {
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

export function useStartFullAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (videoId: string) => analysisService.startVideoAnalysis(videoId),
    onSuccess: (_, videoId) => {
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis"] });
      queryClient.invalidateQueries({ queryKey: ["videos", videoId] });
    },
  });
}

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

export function useVideoChunks(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "chunks"],
    queryFn: () => analysisService.getVideoChunks(videoId!),
    enabled: !!videoId,
    refetchInterval: (query) => {
      const chunks = query.state.data;
      // Poll if we don't have chunk data yet
      if (!chunks || chunks.length === 0) {
        return 2000; // Poll every 2 seconds
      }
      return false;
    },
  });
}

export function useVideoInferences(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "inferences"],
    queryFn: () => analysisService.getVideoInferences(videoId!),
    enabled: !!videoId,
    refetchInterval: (query) => {
      const inferences = query.state.data;
      // Poll if we don't have inference data yet
      if (!inferences || inferences.length === 0) {
        return 2000; // Poll every 2 seconds
      }
      return false;
    },
  });
}

export function useVideoPatterns(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "patterns"],
    queryFn: () => analysisService.getVideoPatterns(videoId!),
    enabled: !!videoId,
    refetchInterval: (query) => {
      const patterns = query.state.data;
      // Poll if we don't have pattern data yet
      if (!patterns || patterns.length === 0) {
        return 2000; // Poll every 2 seconds
      }
      return false;
    },
  });
}

export function useVideoInsights(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "insights"],
    queryFn: () => analysisService.getVideoInsights(videoId!),
    enabled: !!videoId,
    refetchInterval: (query) => {
      const insights = query.state.data;
      // Poll if we don't have insight data yet
      if (!insights || insights.length === 0) {
        return 2000; // Poll every 2 seconds
      }
      return false;
    },
  });
}

export function useVideoPrinciples(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "principles"],
    queryFn: () => analysisService.getVideoPrinciples(videoId!),
    enabled: !!videoId,
    refetchInterval: (query) => {
      const principles = query.state.data;
      // Poll if we don't have principles data yet
      if (!principles || principles.length === 0) {
        return 2000; // Poll every 2 seconds
      }
      return false;
    },
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
