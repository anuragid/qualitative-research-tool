import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CancelToken } from "axios";
import { videosService } from "../services/videos";
import { useBackoffInterval } from "./useBackoffInterval";

export function useProjectVideos(projectId: string | null) {
  const getInterval = useBackoffInterval({
    initialMs: 4000,
    maxMs: 20000,
    growEvery: 6,
  });
  return useQuery({
    queryKey: ["projects", projectId, "videos"],
    queryFn: () => videosService.getByProject(projectId!),
    enabled: !!projectId,
    refetchInterval: (query) => {
      const videos = query.state.data;
      const shouldPoll = !!videos?.some(
        (v) =>
          v.status === "transcribing" ||
          v.status === "analyzing" ||
          (v.status === "transcribed" && !v.transcript) ||
          (v.status === "analyzed" && !v.analysis)
      );
      return getInterval(shouldPoll);
    },
  });
}

export function useVideo(id: string | null) {
  const getInterval = useBackoffInterval({
    initialMs: 4000,
    maxMs: 15000,
    growEvery: 6,
  });
  return useQuery({
    queryKey: ["videos", id],
    queryFn: () => videosService.getById(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const video = query.state.data;
      if (!video) return getInterval(false);

      const needsTranscriptData = video.status === "transcribing";

      const needsAnalysisData =
        video.status === "analyzing" ||
        (video.status === "analyzed" && !video.analysis);

      const needsSpeakerData =
        video.status === "transcribed" &&
        video.transcript &&
        (!video.transcript.speaker_labels || video.transcript.speaker_labels.length === 0);

      const shouldPoll = !!(
        needsTranscriptData || needsAnalysisData || needsSpeakerData
      );
      return getInterval(shouldPoll);
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
    }) => videosService.uploadDirect(projectId, file, onProgress, cancelToken),
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
