import { useQuery } from "@tanstack/react-query";
import api from "../services/api";
import type { TranscriptSearchResult } from "../types";

/**
 * Hook to search for specific words in a transcript using AssemblyAI Word Search.
 *
 * Returns match counts and timestamps for each searched word, enabling quick
 * navigation to specific moments in the video.
 *
 * @param videoId - The video ID to search in
 * @param query - Comma-separated words to search for (e.g., "design,prototype,user")
 * @returns React Query result with search matches and timestamps
 */
export function useTranscriptSearch(
  videoId: string | null,
  query: string
) {
  return useQuery({
    queryKey: ["videos", videoId, "transcript", "search", query],
    queryFn: async (): Promise<TranscriptSearchResult> => {
      const response = await api.get(`/api/videos/${videoId}/transcript/search`, {
        params: { query },
      });
      return response.data;
    },
    enabled: !!videoId && query.length > 0,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}
