import { useQuery } from "@tanstack/react-query";
import api from "../services/api";
import type { WordLevelTranscript } from "../types";

/**
 * Hook to fetch word-level transcript data for video-transcript synchronization.
 *
 * Returns word-by-word timing data with speaker names mapped from speaker labels.
 * Optimized for displaying synchronized video playback with word highlighting.
 *
 * @param videoId - The video ID to fetch transcript for
 * @returns React Query result with word-level transcript data
 */
export function useWordLevelTranscript(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "transcript", "words"],
    queryFn: async (): Promise<WordLevelTranscript> => {
      const response = await api.get(`/api/videos/${videoId}/transcript/words`);
      return response.data;
    },
    enabled: !!videoId,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes (transcript doesn't change often)
  });
}
