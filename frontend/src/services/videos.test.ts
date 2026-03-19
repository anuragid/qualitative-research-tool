import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./api", () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  };
  return { default: mockApi, api: mockApi };
});

import api from "./api";
import { videosService } from "./videos";
import type { Video } from "../types";

const mockedApi = vi.mocked(api);

const mockVideo: Video = {
  id: "vid-1",
  project_id: "proj-1",
  filename: "interview.mp4",
  file_size_bytes: 104857600,
  duration_seconds: 3600,
  uploaded_at: "2026-01-01T00:00:00Z",
  status: "uploaded",
  error_message: null,
};

describe("videosService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getByProject", () => {
    it("fetches videos for a project", async () => {
      const videos = [mockVideo];
      mockedApi.get.mockResolvedValue({ data: videos });

      const result = await videosService.getByProject("proj-1");

      expect(mockedApi.get).toHaveBeenCalledWith("/api/projects/proj-1/videos/");
      expect(result).toEqual(videos);
    });

    it("returns empty array when no videos exist", async () => {
      mockedApi.get.mockResolvedValue({ data: [] });

      const result = await videosService.getByProject("proj-1");

      expect(result).toEqual([]);
    });

    it("propagates errors", async () => {
      mockedApi.get.mockRejectedValue({ status: 404, message: "Project not found" });

      await expect(videosService.getByProject("nonexistent")).rejects.toEqual({
        status: 404,
        message: "Project not found",
      });
    });
  });

  describe("getById", () => {
    it("fetches a single video by id", async () => {
      mockedApi.get.mockResolvedValue({ data: mockVideo });

      const result = await videosService.getById("vid-1");

      expect(mockedApi.get).toHaveBeenCalledWith("/api/videos/vid-1/");
      expect(result).toEqual(mockVideo);
    });

    it("propagates errors", async () => {
      mockedApi.get.mockRejectedValue({ status: 404, message: "Not found" });

      await expect(videosService.getById("nonexistent")).rejects.toEqual({
        status: 404,
        message: "Not found",
      });
    });
  });

  describe("upload", () => {
    it("uploads a video with multipart form data", async () => {
      mockedApi.post.mockResolvedValue({ data: mockVideo });
      const file = new File(["video content"], "test.mp4", {
        type: "video/mp4",
      });

      const result = await videosService.upload("proj-1", file);

      expect(mockedApi.post).toHaveBeenCalledWith(
        "/api/videos/proj-1/upload",
        expect.any(FormData),
        expect.objectContaining({
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 600000,
        })
      );
      expect(result).toEqual(mockVideo);
    });

    it("appends the file to FormData", async () => {
      mockedApi.post.mockResolvedValue({ data: mockVideo });
      const file = new File(["video content"], "test.mp4", {
        type: "video/mp4",
      });

      await videosService.upload("proj-1", file);

      const formData = mockedApi.post.mock.calls[0][1] as FormData;
      expect(formData.get("file")).toBe(file);
    });

    it("calls onProgress callback when upload progress is reported", async () => {
      mockedApi.post.mockImplementation(async (_url, _data, config) => {
        // Simulate progress event
        if (config?.onUploadProgress) {
          config.onUploadProgress({
            loaded: 50000,
            total: 100000,
            bytes: 50000,
            lengthComputable: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        }
        return { data: mockVideo };
      });

      const onProgress = vi.fn();
      const file = new File(["video content"], "test.mp4", {
        type: "video/mp4",
      });

      await videosService.upload("proj-1", file, onProgress);

      expect(onProgress).toHaveBeenCalledWith(50, 50000, 100000);
    });

    it("does not call onProgress when total is undefined", async () => {
      mockedApi.post.mockImplementation(async (_url, _data, config) => {
        if (config?.onUploadProgress) {
          config.onUploadProgress({
            loaded: 50000,
            total: undefined,
            bytes: 50000,
            lengthComputable: false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        }
        return { data: mockVideo };
      });

      const onProgress = vi.fn();
      const file = new File(["video content"], "test.mp4", {
        type: "video/mp4",
      });

      await videosService.upload("proj-1", file, onProgress);

      expect(onProgress).not.toHaveBeenCalled();
    });

    it("does not call onProgress when callback is not provided", async () => {
      mockedApi.post.mockImplementation(async (_url, _data, config) => {
        // Simulate progress event - should not throw even without callback
        if (config?.onUploadProgress) {
          config.onUploadProgress({
            loaded: 50000,
            total: 100000,
            bytes: 50000,
            lengthComputable: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        }
        return { data: mockVideo };
      });

      const file = new File(["video content"], "test.mp4", {
        type: "video/mp4",
      });

      // Should not throw
      const result = await videosService.upload("proj-1", file);
      expect(result).toEqual(mockVideo);
    });

    it("passes cancelToken when provided", async () => {
      mockedApi.post.mockResolvedValue({ data: mockVideo });
      const file = new File(["video content"], "test.mp4", {
        type: "video/mp4",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cancelToken = { promise: Promise.resolve() } as any;

      await videosService.upload("proj-1", file, undefined, cancelToken);

      expect(mockedApi.post).toHaveBeenCalledWith(
        "/api/videos/proj-1/upload",
        expect.any(FormData),
        expect.objectContaining({
          cancelToken,
        })
      );
    });

    it("propagates upload errors", async () => {
      mockedApi.post.mockRejectedValue({ status: 413, message: "File too large" });
      const file = new File(["video content"], "test.mp4", {
        type: "video/mp4",
      });

      await expect(videosService.upload("proj-1", file)).rejects.toEqual({
        status: 413,
        message: "File too large",
      });
    });
  });

  describe("delete", () => {
    it("deletes a video by id", async () => {
      mockedApi.delete.mockResolvedValue({});

      await videosService.delete("vid-1");

      expect(mockedApi.delete).toHaveBeenCalledWith("/api/videos/vid-1/");
    });

    it("propagates errors", async () => {
      mockedApi.delete.mockRejectedValue({ status: 404, message: "Not found" });

      await expect(videosService.delete("nonexistent")).rejects.toEqual({
        status: 404,
        message: "Not found",
      });
    });
  });

  describe("getPlaybackUrl", () => {
    it("fetches playback url for a video", async () => {
      mockedApi.get.mockResolvedValue({
        data: { playback_url: "https://cdn.example.com/presigned-url" },
      });

      const result = await videosService.getPlaybackUrl("vid-1");

      expect(mockedApi.get).toHaveBeenCalledWith("/api/videos/vid-1/playback-url");
      expect(result).toBe("https://cdn.example.com/presigned-url");
    });

    it("propagates errors", async () => {
      mockedApi.get.mockRejectedValue({ status: 404, message: "Not found" });

      await expect(videosService.getPlaybackUrl("nonexistent")).rejects.toEqual({
        status: 404,
        message: "Not found",
      });
    });
  });
});
