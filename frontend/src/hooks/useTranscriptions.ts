import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { transcriptionsService } from "../services/transcriptions";
import type { LabelSpeakerDto } from "../types";

export function useTranscript(videoId: string | null, shouldFetch: boolean = true) {
  return useQuery({
    queryKey: ["videos", videoId, "transcript"],
    queryFn: () => transcriptionsService.get(videoId!),
    enabled: !!videoId && shouldFetch,
    retry: (failureCount, error: unknown) => {
      // Don't retry on 404 - transcript doesn't exist yet
      const status = (error as { status?: number })?.status;
      if (status === 404) {
        return false;
      }
      return failureCount < 3;
    },
    refetchInterval: (query) => {
      if (document.hidden) return false;
      const transcript = query.state.data;

      if (
        !transcript ||
        transcript.status === "pending" ||
        transcript.status === "processing"
      ) {
        return 4000;
      }

      if (transcript.status === "completed") {
        const hasSpeakers = transcript.speaker_labels && transcript.speaker_labels.length > 0;

        if (!hasSpeakers) {
          const completedAt = transcript.completed_at ? new Date(transcript.completed_at).getTime() : Date.now();
          const timeSinceCompletion = Date.now() - completedAt;

          if (timeSinceCompletion < 30000) {
            return 3000;
          }
        }
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
      // Invalidate both video and transcript queries to ensure polling starts
      queryClient.invalidateQueries({ queryKey: ["videos", videoId] });
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "transcript"] });
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
      videoId: string;
      data: LabelSpeakerDto;
    }) => transcriptionsService.labelSpeaker(transcriptId, data),
    onSuccess: (_, variables) => {
      // Invalidate speaker query
      queryClient.invalidateQueries({
        queryKey: ["transcripts", variables.transcriptId, "speakers"],
      });

      // Invalidate video and transcript queries so TranscriptViewer refreshes
      queryClient.invalidateQueries({
        queryKey: ["videos", variables.videoId],
      });
      queryClient.invalidateQueries({
        queryKey: ["videos", variables.videoId, "transcript"],
      });
    },
  });
}
