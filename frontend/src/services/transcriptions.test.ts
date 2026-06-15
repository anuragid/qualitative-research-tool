import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./api", () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
  };
  return { default: mockApi, api: mockApi };
});

import api from "./api";
import { transcriptionsService } from "./transcriptions";
import type { Transcript, SpeakerLabel, LabelSpeakerDto } from "../types";

const mockedApi = vi.mocked(api);

const mockTranscript: Transcript = {
  id: "trans-1",
  video_id: "vid-1",
  assemblyai_id: "aai-123",
  raw_transcript: {},
  processed_transcript: {
    text: "Hello, how are you?",
    utterances: [
      {
        speaker: "A",
        text: "Hello, how are you?",
        start: 0,
        end: 3000,
        confidence: 0.95,
      },
    ],
  },
  status: "completed",
  created_at: "2026-01-01T00:00:00Z",
  completed_at: "2026-01-01T00:05:00Z",
};

const mockSpeakerLabels: SpeakerLabel[] = [
  {
    id: "sl-1",
    transcript_id: "trans-1",
    speaker_label: "A",
    assigned_name: "John",
    role: "interviewer",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "sl-2",
    transcript_id: "trans-1",
    speaker_label: "B",
    assigned_name: "Jane",
    role: "interviewee",
    created_at: "2026-01-01T00:00:00Z",
  },
];

describe("transcriptionsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("start", () => {
    it("starts transcription for a video", async () => {
      mockedApi.post.mockResolvedValue({ data: { task_id: "task-123" } });

      const result = await transcriptionsService.start("vid-1");

      expect(mockedApi.post).toHaveBeenCalledWith(
        "/api/videos/vid-1/transcribe"
      );
      expect(result).toEqual({ task_id: "task-123" });
    });

    it("propagates errors", async () => {
      mockedApi.post.mockRejectedValue({
        status: 400,
        message: "Video not ready",
      });

      await expect(transcriptionsService.start("vid-1")).rejects.toEqual({
        status: 400,
        message: "Video not ready",
      });
    });
  });

  describe("get", () => {
    it("fetches transcript for a video", async () => {
      mockedApi.get.mockResolvedValue({ data: mockTranscript });

      const result = await transcriptionsService.get("vid-1");

      expect(mockedApi.get).toHaveBeenCalledWith(
        "/api/videos/vid-1/transcript"
      );
      expect(result).toEqual(mockTranscript);
    });

    it("propagates errors", async () => {
      mockedApi.get.mockRejectedValue({
        status: 404,
        message: "Transcript not found",
      });

      await expect(transcriptionsService.get("vid-1")).rejects.toEqual({
        status: 404,
        message: "Transcript not found",
      });
    });
  });

  describe("getSpeakers", () => {
    it("fetches speaker labels for a transcript", async () => {
      mockedApi.get.mockResolvedValue({ data: mockSpeakerLabels });

      const result = await transcriptionsService.getSpeakers("trans-1");

      expect(mockedApi.get).toHaveBeenCalledWith(
        "/api/transcripts/trans-1/speakers"
      );
      expect(result).toEqual(mockSpeakerLabels);
      expect(result).toHaveLength(2);
    });

    it("returns empty array when no speakers", async () => {
      mockedApi.get.mockResolvedValue({ data: [] });

      const result = await transcriptionsService.getSpeakers("trans-1");

      expect(result).toEqual([]);
    });

    it("propagates errors", async () => {
      mockedApi.get.mockRejectedValue({
        status: 404,
        message: "Transcript not found",
      });

      await expect(
        transcriptionsService.getSpeakers("nonexistent")
      ).rejects.toEqual({
        status: 404,
        message: "Transcript not found",
      });
    });
  });

  describe("labelSpeaker", () => {
    it("labels a speaker by posting an array with the label data", async () => {
      const labelDto: LabelSpeakerDto = {
        speaker_label: "A",
        assigned_name: "John",
        role: "interviewer",
      };
      mockedApi.post.mockResolvedValue({ data: mockSpeakerLabels });

      const result = await transcriptionsService.labelSpeaker(
        "trans-1",
        labelDto
      );

      expect(mockedApi.post).toHaveBeenCalledWith(
        "/api/transcripts/trans-1/speakers",
        [labelDto]
      );
      expect(result).toEqual(mockSpeakerLabels);
    });

    it("labels a speaker without a role", async () => {
      const labelDto: LabelSpeakerDto = {
        speaker_label: "B",
        assigned_name: "Jane",
      };
      mockedApi.post.mockResolvedValue({ data: [mockSpeakerLabels[1]] });

      const result = await transcriptionsService.labelSpeaker(
        "trans-1",
        labelDto
      );

      expect(mockedApi.post).toHaveBeenCalledWith(
        "/api/transcripts/trans-1/speakers",
        [labelDto]
      );
      expect(result).toHaveLength(1);
    });

    it("propagates errors", async () => {
      const labelDto: LabelSpeakerDto = {
        speaker_label: "A",
        assigned_name: "John",
      };
      mockedApi.post.mockRejectedValue({
        status: 400,
        message: "Invalid speaker label",
      });

      await expect(
        transcriptionsService.labelSpeaker("trans-1", labelDto)
      ).rejects.toEqual({
        status: 400,
        message: "Invalid speaker label",
      });
    });
  });
});
