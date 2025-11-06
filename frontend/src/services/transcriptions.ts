import api from "./api";
import type { Transcript, SpeakerLabel, LabelSpeakerDto } from "../types";

export const transcriptionsService = {
  // Start transcription
  start: async (videoId: string): Promise<{ task_id: string }> => {
    const response = await api.post(`/api/videos/${videoId}/transcribe/`);
    return response.data;
  },

  // Get transcript
  get: async (videoId: string): Promise<Transcript> => {
    const response = await api.get(`/api/videos/${videoId}/transcript/`);
    return response.data;
  },

  // Get speaker labels
  getSpeakers: async (transcriptId: string): Promise<SpeakerLabel[]> => {
    const response = await api.get(`/api/transcripts/${transcriptId}/speakers/`);
    return response.data;
  },

  // Label speaker
  labelSpeaker: async (
    transcriptId: string,
    data: LabelSpeakerDto
  ): Promise<SpeakerLabel[]> => {
    // Backend expects an array of speaker labels
    const response = await api.post(
      `/api/transcripts/${transcriptId}/speakers`,
      [data]
    );
    return response.data;
  },
};
