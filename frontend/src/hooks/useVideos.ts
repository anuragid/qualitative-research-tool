import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CancelToken } from "axios";
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
            (v.status === "analyzed" && !v.analysis)
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

      // Poll while analyzing OR analyzed but analysis data not loaded yet
      const needsAnalysisData =
        video.status === "analyzing" ||
        (video.status === "analyzed" && !video.analysis);

      // IMPORTANT: Also check for speaker labels after transcription
      // Even if transcript exists, we might not have speaker labels yet
      const needsSpeakerData =
        video.status === "transcribed" &&
        video.transcript &&
        (!video.transcript.speaker_labels || video.transcript.speaker_labels.length === 0);

      if (needsTranscriptData || needsAnalysisData || needsSpeakerData) {
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
      cancelToken?: CancelToken;
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
    queryFn: () => videosService.getPlaybackUrl(videoId!),
    enabled: !!videoId,
    staleTime: 1000 * 60 * 50, // Refresh after 50 minutes (URL valid for 1 hour)
  });
}
