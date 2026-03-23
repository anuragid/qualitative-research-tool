// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useProjectVideos,
  useVideo,
  useUploadVideo,
  useDeleteVideo,
  useVideoPlaybackUrl,
} from "./useVideos";

vi.mock("../services/videos", () => ({
  videosService: {
    getByProject: vi.fn(),
    getById: vi.fn(),
    upload: vi.fn(),
    uploadDirect: vi.fn(),
    getUploadUrl: vi.fn(),
    confirmUpload: vi.fn(),
    delete: vi.fn(),
    getPlaybackUrl: vi.fn(),
  },
}));

import { videosService } from "../services/videos";

const mockedService = videosService as {
  getByProject: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  upload: ReturnType<typeof vi.fn>;
  uploadDirect: ReturnType<typeof vi.fn>;
  getUploadUrl: ReturnType<typeof vi.fn>;
  confirmUpload: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  getPlaybackUrl: ReturnType<typeof vi.fn>;
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

describe("useProjectVideos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches videos for a project", async () => {
    const videos = [
      { id: "v1", project_id: "p1", filename: "video1.mp4", status: "uploaded" },
      { id: "v2", project_id: "p1", filename: "video2.mp4", status: "transcribed" },
    ];
    mockedService.getByProject.mockResolvedValue(videos);

    const { result } = renderHook(() => useProjectVideos("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(videos);
    expect(mockedService.getByProject).toHaveBeenCalledWith("p1");
  });

  it("does not fetch when projectId is null", () => {
    const { result } = renderHook(() => useProjectVideos(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockedService.getByProject).not.toHaveBeenCalled();
  });

  it("polls when any video is transcribing", async () => {
    const videos = [
      { id: "v1", project_id: "p1", filename: "video1.mp4", status: "transcribing" },
    ];
    mockedService.getByProject.mockResolvedValue(videos);

    const { result } = renderHook(() => useProjectVideos("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("polls when any video is analyzing", async () => {
    const videos = [
      { id: "v1", project_id: "p1", filename: "video1.mp4", status: "analyzing" },
    ];
    mockedService.getByProject.mockResolvedValue(videos);

    const { result } = renderHook(() => useProjectVideos("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("polls when video is transcribed but has no transcript", async () => {
    const videos = [
      { id: "v1", project_id: "p1", filename: "video1.mp4", status: "transcribed", transcript: undefined },
    ];
    mockedService.getByProject.mockResolvedValue(videos);

    const { result } = renderHook(() => useProjectVideos("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("polls when video is analyzed but has no analysis", async () => {
    const videos = [
      { id: "v1", project_id: "p1", filename: "video1.mp4", status: "analyzed", analysis: undefined },
    ];
    mockedService.getByProject.mockResolvedValue(videos);

    const { result } = renderHook(() => useProjectVideos("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("does not poll when all videos are in stable states", async () => {
    const videos = [
      { id: "v1", project_id: "p1", filename: "video1.mp4", status: "uploaded" },
    ];
    mockedService.getByProject.mockResolvedValue(videos);

    const { result } = renderHook(() => useProjectVideos("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches a single video by id", async () => {
    const video = { id: "v1", status: "uploaded", filename: "video.mp4" };
    mockedService.getById.mockResolvedValue(video);

    const { result } = renderHook(() => useVideo("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(video);
    expect(mockedService.getById).toHaveBeenCalledWith("v1");
  });

  it("does not fetch when id is null", () => {
    const { result } = renderHook(() => useVideo(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockedService.getById).not.toHaveBeenCalled();
  });

  it("polls when video is transcribing", async () => {
    const video = { id: "v1", status: "transcribing" };
    mockedService.getById.mockResolvedValue(video);

    const { result } = renderHook(() => useVideo("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("transcribing");
  });

  it("polls when video is transcribed but transcript not loaded", async () => {
    const video = { id: "v1", status: "transcribed", transcript: undefined };
    mockedService.getById.mockResolvedValue(video);

    const { result } = renderHook(() => useVideo("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("polls when video is analyzing", async () => {
    const video = { id: "v1", status: "analyzing" };
    mockedService.getById.mockResolvedValue(video);

    const { result } = renderHook(() => useVideo("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("analyzing");
  });

  it("polls when video is analyzed but analysis not loaded", async () => {
    const video = { id: "v1", status: "analyzed", analysis: undefined };
    mockedService.getById.mockResolvedValue(video);

    const { result } = renderHook(() => useVideo("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("polls when transcribed but missing speaker labels", async () => {
    const video = {
      id: "v1",
      status: "transcribed",
      transcript: { id: "t1", speaker_labels: [] },
    };
    mockedService.getById.mockResolvedValue(video);

    const { result } = renderHook(() => useVideo("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("does not poll when video is fully loaded with speakers", async () => {
    const video = {
      id: "v1",
      status: "transcribed",
      transcript: { id: "t1", speaker_labels: [{ id: "sl1" }] },
    };
    mockedService.getById.mockResolvedValue(video);

    const { result } = renderHook(() => useVideo("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("returns false for refetchInterval when video data is null", async () => {
    mockedService.getById.mockResolvedValue(null);

    const { result } = renderHook(() => useVideo("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useUploadVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads a video and invalidates queries", async () => {
    const uploaded = { id: "v1", filename: "video.mp4" };
    mockedService.uploadDirect.mockResolvedValue(uploaded);

    const { result } = renderHook(() => useUploadVideo(), {
      wrapper: createWrapper(),
    });

    const mockFile = new File(["content"], "video.mp4", { type: "video/mp4" });

    await act(async () => {
      result.current.mutate({
        projectId: "p1",
        file: mockFile,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.uploadDirect).toHaveBeenCalledWith(
      "p1",
      mockFile,
      undefined,
      undefined
    );
  });

  it("passes onProgress and cancelToken", async () => {
    const uploaded = { id: "v1", filename: "video.mp4" };
    mockedService.uploadDirect.mockResolvedValue(uploaded);

    const { result } = renderHook(() => useUploadVideo(), {
      wrapper: createWrapper(),
    });

    const mockFile = new File(["content"], "video.mp4", { type: "video/mp4" });
    const onProgress = vi.fn();
    const cancelToken = {} as import("axios").CancelToken;

    await act(async () => {
      result.current.mutate({
        projectId: "p1",
        file: mockFile,
        onProgress,
        cancelToken,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.uploadDirect).toHaveBeenCalledWith(
      "p1",
      mockFile,
      onProgress,
      cancelToken
    );
  });

  it("handles upload error", async () => {
    mockedService.uploadDirect.mockRejectedValue(new Error("Upload failed"));

    const { result } = renderHook(() => useUploadVideo(), {
      wrapper: createWrapper(),
    });

    const mockFile = new File(["content"], "video.mp4", { type: "video/mp4" });

    await act(async () => {
      result.current.mutate({ projectId: "p1", file: mockFile });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useDeleteVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a video and invalidates queries", async () => {
    mockedService.delete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteVideo(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("v1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.delete).toHaveBeenCalledWith("v1");
  });

  it("handles delete error", async () => {
    mockedService.delete.mockRejectedValue(new Error("Delete failed"));

    const { result } = renderHook(() => useDeleteVideo(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("v1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useVideoPlaybackUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches playback URL when videoId is provided", async () => {
    mockedService.getPlaybackUrl.mockResolvedValue("https://example.com/video.mp4");

    const { result } = renderHook(() => useVideoPlaybackUrl("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe("https://example.com/video.mp4");
    expect(mockedService.getPlaybackUrl).toHaveBeenCalledWith("v1");
  });

  it("does not fetch when videoId is null", () => {
    const { result } = renderHook(() => useVideoPlaybackUrl(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockedService.getPlaybackUrl).not.toHaveBeenCalled();
  });
});
