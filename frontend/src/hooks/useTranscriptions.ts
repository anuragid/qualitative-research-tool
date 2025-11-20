import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { transcriptionsService } from "../services/transcriptions";
import type { LabelSpeakerDto } from "../types";

export function useTranscript(videoId: string | null, shouldFetch: boolean = true) {
  return useQuery({
    queryKey: ["videos", videoId, "transcript"],
    queryFn: () => transcriptionsService.get(videoId!),
    enabled: !!videoId && shouldFetch,
    retry: (failureCount, error: any) => {
      // Don't retry on 404 - transcript doesn't exist yet
      if (error?.response?.status === 404) {
        return false;
      }
      return failureCount < 3;
    },
    refetchInterval: (query) => {
      const transcript = query.state.data;
      // Poll if:
      // 1. We don't have transcript data yet, OR
      // 2. Transcript is still processing, OR
      // 3. Transcript exists but doesn't have processed content yet
      if (
        !transcript ||
        transcript.status === "pending" ||
        transcript.status === "processing" ||
        !transcript.processed_transcript ||
        !transcript.processed_transcript.utterances ||
        transcript.processed_transcript.utterances.length === 0
      ) {
        return 2000; // Poll every 2 seconds
      }
      return false;
    },
  });
}

export function useSpeakerLabels(transcriptId: string | null) {
  return useQuery({
    queryKey: ["transcripts", transcriptId, "speakers"],
    queryFn: () => transcriptionsService.getSpeakers(transcriptId!),
    enabled: !!transcriptId,
  });
}

export function useStartTranscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (videoId: string) => transcriptionsService.start(videoId),
    onSuccess: (_, videoId) => {
      queryClient.invalidateQueries({ queryKey: ["videos", videoId] });
    },
  });
}

export function useLabelSpeaker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      transcriptId,
      data,
    }: {
      transcriptId: string;
      data: LabelSpeakerDto;
    }) => transcriptionsService.labelSpeaker(transcriptId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["transcripts", variables.transcriptId, "speakers"],
      });
    },
  });
}
