import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { videosService } from "../services/videos";

export function useProjectVideos(projectId: string | null) {
  return useQuery({
    queryKey: ["projects", projectId, "videos"],
    queryFn: () => videosService.getByProject(projectId!),
    enabled: !!projectId,
    refetchInterval: (query) => {
      const videos = query.state.data;
      // Poll if any video is transcribing or analyzing
      if (
        videos?.some(
          (v) =>
            v.status === "transcribing" ||
            v.status === "analyzing" ||
            (v.status === "transcribed" && !v.transcript) ||
            (v.status === "completed" && !v.analysis)
        )
      ) {
        return 2000; // Poll every 2 seconds
      }
      return false;
    },
  });
}

export function useVideo(id: string | null) {
  return useQuery({
    queryKey: ["videos", id],
    queryFn: () => videosService.getById(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const video = query.state.data;
      if (!video) return false;

      // Poll while transcribing OR transcribed but transcript data not loaded yet
      const needsTranscriptData =
        video.status === "transcribing" ||
        (video.status === "transcribed" && !video.transcript);

      // Poll while analyzing OR completed but analysis data not loaded yet
      const needsAnalysisData =
        video.status === "analyzing" ||
        (video.status === "completed" && !video.analysis);

      if (needsTranscriptData || needsAnalysisData) {
        return 2000; // Poll every 2 seconds for faster feedback
      }

      return false;
    },
  });
}

export function useUploadVideo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      file,
      onProgress,
      cancelToken,
    }: {
      projectId: string;
      file: File;
      onProgress?: (progress: number, loaded: number, total: number) => void;
      cancelToken?: any;
    }) => videosService.upload(projectId, file, onProgress, cancelToken),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", variables.projectId, "videos"],
      });
    },
  });
}

export function useDeleteVideo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => videosService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useVideoPlaybackUrl(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "playback-url"],
    queryFn: async () => {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const response = await fetch(
        `${apiUrl}/api/videos/${videoId}/playback-url`
      );
      if (!response.ok) {
        throw new Error("Failed to get playback URL");
      }
      const data = await response.json();
      return data.playback_url as string;
    },
    enabled: !!videoId,
    staleTime: 1000 * 60 * 50, // Refresh after 50 minutes (URL valid for 1 hour)
  });
}
