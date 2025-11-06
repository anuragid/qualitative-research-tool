import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { transcriptionsService } from "../services/transcriptions";
import type { LabelSpeakerDto } from "../types";

export function useTranscript(videoId: string | null) {
  return useQuery({
    queryKey: ["videos", videoId, "transcript"],
    queryFn: () => transcriptionsService.get(videoId!),
    enabled: !!videoId,
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
