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

      // IMPORTANT: Continue polling briefly after completion to catch speaker detection
      // AssemblyAI may add speaker labels slightly after the initial transcript
      if (transcript.status === "completed") {
        // Check if we have speakers yet
        const hasSpeakers = transcript.speaker_labels && transcript.speaker_labels.length > 0;

        if (!hasSpeakers) {
          // No speakers detected yet, keep polling for up to ~30 seconds after completion
          // This gives AssemblyAI time to complete speaker diarization
          const completedAt = transcript.completed_at ? new Date(transcript.completed_at).getTime() : Date.now();
          const timeSinceCompletion = Date.now() - completedAt;

          if (timeSinceCompletion < 30000) { // Poll for up to 30 seconds
            return 1500; // Poll every 1.5 seconds for speaker detection
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
      data: LabelSpeakerDto;
    }) => transcriptionsService.labelSpeaker(transcriptId, data),
    onSuccess: (result, variables) => {
      // Invalidate speaker query
      queryClient.invalidateQueries({
        queryKey: ["transcripts", variables.transcriptId, "speakers"],
      });

      // Also invalidate transcript and video queries to reflect the update
      // Note: result is SpeakerLabel[] which doesn't contain video_id
      // TODO: If needed, we could extract video_id from the transcript context
    },
  });
}
