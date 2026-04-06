import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { transcriptionsService } from "../services/transcriptions";
import type { LabelSpeakerDto } from "../types";
import { useBackoffInterval } from "./useBackoffInterval";

export function useTranscript(videoId: string | null, shouldFetch: boolean = true) {
  // Track when we first saw "completed" — the server response doesn't include
  // completed_at or speaker_labels, so we can't rely on those for the poll window.
  const completedSeenAt = useRef<number | null>(null);

  // Backoff for the active processing phase (before completion).
  // Post-completion speaker-label window stays at fixed 3s — see below.
  const getProcessingInterval = useBackoffInterval({
    initialMs: 6000,
    maxMs: 18000,
    growEvery: 6,
  });

  return useQuery({
    queryKey: ["videos", videoId, "transcript"],
    queryFn: () => transcriptionsService.get(videoId!),
    enabled: !!videoId && shouldFetch,
    retry: (failureCount, error: unknown) => {
      const status = (error as { status?: number })?.status;
      if (status === 404) return false;
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
        completedSeenAt.current = null;
        return getProcessingInterval(true);
      }

      if (transcript.status === "completed") {
        // Record the first time we see "completed"
        if (completedSeenAt.current === null) {
          completedSeenAt.current = Date.now();
        }
        // Poll for 30 seconds after completion to allow speaker label detection
        const elapsed = Date.now() - completedSeenAt.current;
        if (elapsed < 30000) {
          return 3000;
        }
      }

      // Terminal (or post-completion window elapsed) — stop and reset backoff.
      getProcessingInterval(false);
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
