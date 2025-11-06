import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { videosService } from "../services/videos";

export function useProjectVideos(projectId: string | null) {
  return useQuery({
    queryKey: ["projects", projectId, "videos"],
    queryFn: () => videosService.getByProject(projectId!),
    enabled: !!projectId,
  });
}

export function useVideo(id: string | null) {
  return useQuery({
    queryKey: ["videos", id],
    queryFn: () => videosService.getById(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const video = query.state.data;
      // Poll while transcribing or analyzing
      if (
        video &&
        (video.status === "transcribing" || video.status === "analyzing")
      ) {
        return 3000; // Poll every 3 seconds
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
    }: {
      projectId: string;
      file: File;
      onProgress?: (progress: number) => void;
    }) => videosService.upload(projectId, file, onProgress),
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
      const response = await fetch(
        `http://localhost:8000/api/videos/${videoId}/playback-url`
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
