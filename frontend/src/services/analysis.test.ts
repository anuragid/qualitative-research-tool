import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./api", () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
  };
  return { default: mockApi, api: mockApi };
});

import api from "./api";
import { analysisService } from "./analysis";
import type { VideoAnalysis, ProjectAnalysis } from "../types";

const mockedApi = vi.mocked(api);

const mockVideoAnalysis: VideoAnalysis = {
  id: "analysis-1",
  video_id: "vid-1",
  chunks: null,
  chunks_completed_at: null,
  inferences: null,
  inferences_completed_at: null,
  patterns: null,
  patterns_completed_at: null,
  insights: null,
  insights_completed_at: null,
  design_principles: null,
  principles_completed_at: null,
  status: "pending",
  started_at: null,
  completed_at: null,
  error_message: null,
  current_step: null,
  step_status: null,
  chunk_completed_at: null,
  infer_completed_at: null,
  relate_completed_at: null,
  explain_completed_at: null,
  activate_completed_at: null,
};

const mockProjectAnalysis: ProjectAnalysis = {
  id: "proj-analysis-1",
  project_id: "proj-1",
  video_ids: ["vid-1", "vid-2"],
  cross_video_patterns: null,
  patterns_completed_at: null,
  cross_video_insights: null,
  insights_completed_at: null,
  cross_video_principles: null,
  principles_completed_at: null,
  status: "pending",
  started_at: null,
  completed_at: null,
  error_message: null,
};

describe("analysisService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startVideoAnalysis", () => {
    it("starts video analysis for a video", async () => {
      mockedApi.post.mockResolvedValue({ data: { task_id: "task-1" } });

      const result = await analysisService.startVideoAnalysis("vid-1");

      expect(mockedApi.post).toHaveBeenCalledWith(
        "/api/videos/vid-1/analyze"
      );
      expect(result).toEqual({ task_id: "task-1" });
    });

    it("propagates errors", async () => {
      mockedApi.post.mockRejectedValue({
        status: 400,
        message: "Video not transcribed",
      });

      await expect(
        analysisService.startVideoAnalysis("vid-1")
      ).rejects.toEqual({
        status: 400,
        message: "Video not transcribed",
      });
    });
  });

  describe("startChunkStep", () => {
    it("starts chunk step analysis", async () => {
      mockedApi.post.mockResolvedValue({ data: { task_id: "task-chunk" } });

      const result = await analysisService.startChunkStep("vid-1");

      expect(mockedApi.post).toHaveBeenCalledWith(
        "/api/videos/vid-1/analyze/chunk"
      );
      expect(result).toEqual({ task_id: "task-chunk" });
    });

    it("propagates errors", async () => {
      mockedApi.post.mockRejectedValue({ status: 500, message: "Failed" });

      await expect(analysisService.startChunkStep("vid-1")).rejects.toEqual({
        status: 500,
        message: "Failed",
      });
    });
  });

  describe("startInferStep", () => {
    it("starts infer step analysis", async () => {
      mockedApi.post.mockResolvedValue({ data: { task_id: "task-infer" } });

      const result = await analysisService.startInferStep("vid-1");

      expect(mockedApi.post).toHaveBeenCalledWith(
        "/api/videos/vid-1/analyze/infer"
      );
      expect(result).toEqual({ task_id: "task-infer" });
    });

    it("propagates errors", async () => {
      mockedApi.post.mockRejectedValue({ status: 500, message: "Failed" });

      await expect(analysisService.startInferStep("vid-1")).rejects.toEqual({
        status: 500,
        message: "Failed",
      });
    });
  });

  describe("startRelateStep", () => {
    it("starts relate step analysis", async () => {
      mockedApi.post.mockResolvedValue({ data: { task_id: "task-relate" } });

      const result = await analysisService.startRelateStep("vid-1");

      expect(mockedApi.post).toHaveBeenCalledWith(
        "/api/videos/vid-1/analyze/relate"
      );
      expect(result).toEqual({ task_id: "task-relate" });
    });

    it("propagates errors", async () => {
      mockedApi.post.mockRejectedValue({ status: 500, message: "Failed" });

      await expect(analysisService.startRelateStep("vid-1")).rejects.toEqual({
        status: 500,
        message: "Failed",
      });
    });
  });

  describe("startExplainStep", () => {
    it("starts explain step analysis", async () => {
      mockedApi.post.mockResolvedValue({ data: { task_id: "task-explain" } });

      const result = await analysisService.startExplainStep("vid-1");

      expect(mockedApi.post).toHaveBeenCalledWith(
        "/api/videos/vid-1/analyze/explain"
      );
      expect(result).toEqual({ task_id: "task-explain" });
    });

    it("propagates errors", async () => {
      mockedApi.post.mockRejectedValue({ status: 500, message: "Failed" });

      await expect(analysisService.startExplainStep("vid-1")).rejects.toEqual({
        status: 500,
        message: "Failed",
      });
    });
  });

  describe("startActivateStep", () => {
    it("starts activate step analysis", async () => {
      mockedApi.post.mockResolvedValue({ data: { task_id: "task-activate" } });

      const result = await analysisService.startActivateStep("vid-1");

      expect(mockedApi.post).toHaveBeenCalledWith(
        "/api/videos/vid-1/analyze/activate"
      );
      expect(result).toEqual({ task_id: "task-activate" });
    });

    it("propagates errors", async () => {
      mockedApi.post.mockRejectedValue({ status: 500, message: "Failed" });

      await expect(
        analysisService.startActivateStep("vid-1")
      ).rejects.toEqual({
        status: 500,
        message: "Failed",
      });
    });
  });

  describe("getVideoAnalysis", () => {
    it("fetches video analysis", async () => {
      mockedApi.get.mockResolvedValue({ data: mockVideoAnalysis });

      const result = await analysisService.getVideoAnalysis("vid-1");

      expect(mockedApi.get).toHaveBeenCalledWith(
        "/api/videos/vid-1/analysis"
      );
      expect(result).toEqual(mockVideoAnalysis);
    });

    it("returns completed analysis with all fields populated", async () => {
      const completedAnalysis: VideoAnalysis = {
        ...mockVideoAnalysis,
        status: "completed",
        chunks: [
          {
            chunk_id: "c1",
            speaker: "A",
            timestamp: "00:01",
            text: "Hello",
            type: "quote",
          },
        ],
        inferences: [
          {
            chunk_id: "c1",
            inferences: [
              {
                inference_id: "i1",
                meaning: "Greeting",
                importance: "low",
                context: "Start of conversation",
              },
            ],
          },
        ],
      };
      mockedApi.get.mockResolvedValue({ data: completedAnalysis });

      const result = await analysisService.getVideoAnalysis("vid-1");

      expect(result.status).toBe("completed");
      expect(result.chunks).toHaveLength(1);
      expect(result.inferences).toHaveLength(1);
    });

    it("propagates errors", async () => {
      mockedApi.get.mockRejectedValue({
        status: 404,
        message: "Analysis not found",
        silent: true,
      });

      await expect(
        analysisService.getVideoAnalysis("vid-1")
      ).rejects.toEqual({
        status: 404,
        message: "Analysis not found",
        silent: true,
      });
    });
  });

  describe("startProjectAnalysis", () => {
    it("starts project-level cross-video analysis", async () => {
      mockedApi.post.mockResolvedValue({ data: { task_id: "task-proj" } });

      const result = await analysisService.startProjectAnalysis("proj-1");

      expect(mockedApi.post).toHaveBeenCalledWith(
        "/api/projects/proj-1/analyze"
      );
      expect(result).toEqual({ task_id: "task-proj" });
    });

    it("propagates errors", async () => {
      mockedApi.post.mockRejectedValue({
        status: 400,
        message: "Not enough videos",
      });

      await expect(
        analysisService.startProjectAnalysis("proj-1")
      ).rejects.toEqual({
        status: 400,
        message: "Not enough videos",
      });
    });
  });

  describe("getProjectAnalysis", () => {
    it("fetches project analysis", async () => {
      mockedApi.get.mockResolvedValue({ data: mockProjectAnalysis });

      const result = await analysisService.getProjectAnalysis("proj-1");

      expect(mockedApi.get).toHaveBeenCalledWith(
        "/api/projects/proj-1/analysis"
      );
      expect(result).toEqual(mockProjectAnalysis);
    });

    it("returns completed project analysis with populated fields", async () => {
      const completedProjectAnalysis: ProjectAnalysis = {
        ...mockProjectAnalysis,
        status: "completed",
        cross_video_patterns: [
          {
            meta_pattern_id: "mp-1",
            pattern_name: "Pattern 1",
            description: "A cross-video pattern",
            appears_in_videos: ["vid-1", "vid-2"],
            related_patterns: ["p-1"],
            consistency: "consistent",
            context_sensitivity: "low",
            significance: "high",
          },
        ],
      };
      mockedApi.get.mockResolvedValue({ data: completedProjectAnalysis });

      const result = await analysisService.getProjectAnalysis("proj-1");

      expect(result.status).toBe("completed");
      expect(result.cross_video_patterns).toHaveLength(1);
    });

    it("propagates errors", async () => {
      mockedApi.get.mockRejectedValue({
        status: 404,
        message: "Analysis not found",
        silent: true,
      });

      await expect(
        analysisService.getProjectAnalysis("proj-1")
      ).rejects.toEqual({
        status: 404,
        message: "Analysis not found",
        silent: true,
      });
    });
  });
});
