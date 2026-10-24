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
 * @param enabled - Set false until the transcript is completed; the endpoint
 *   404s while the transcript row has no AssemblyAI result yet
 * @returns React Query result with word-level transcript data
 */
export function useWordLevelTranscript(videoId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ["videos", videoId, "transcript", "words"],
    queryFn: async (): Promise<WordLevelTranscript> => {
      const response = await api.get(`/api/videos/${videoId}/transcript/words`);
      return response.data;
    },
    enabled: !!videoId && enabled,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes (transcript doesn't change often)
  });
}
