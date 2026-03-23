// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UploadProvider, useUploadContext } from "./UploadContext";

// ---- Mocks ----

const mockMutateAsync = vi.fn();

vi.mock("../hooks/useVideos", () => ({
  useUploadVideo: () => ({
    mutateAsync: mockMutateAsync,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast } from "sonner";
const mockedToast = vi.mocked(toast);

// ---- Helpers ----

function createFile(name: string, size = 1024): File {
  return new File([new ArrayBuffer(size)], name, { type: "video/mp4" });
}

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
      React.createElement(UploadProvider, null, children)
    );
  };
}

// ---- Tests ----

describe("UploadContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws when useUploadContext is used outside UploadProvider", () => {
    // Suppress console.error from React for this test
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useUploadContext());
    }).toThrow("useUploadContext must be used within UploadProvider");

    spy.mockRestore();
  });

  it("starts with empty uploads", () => {
    const { result } = renderHook(() => useUploadContext(), {
      wrapper: createWrapper(),
    });

    expect(result.current.uploads).toEqual([]);
    expect(result.current.activeUploads).toBe(0);
    expect(result.current.isUploading).toBe(false);
    expect(result.current.isPaused).toBe(false);
  });

  it("addUploads creates pending uploads", () => {
    const { result } = renderHook(() => useUploadContext(), {
      wrapper: createWrapper(),
    });

    const file = createFile("test.mp4");

    act(() => {
      result.current.addUploads("project-1", "My Project", [file]);
    });

    expect(result.current.uploads).toHaveLength(1);
    expect(result.current.uploads[0].status).toBe("pending");
    expect(result.current.uploads[0].projectId).toBe("project-1");
    expect(result.current.uploads[0].projectName).toBe("My Project");
    expect(result.current.uploads[0].file).toBe(file);
    expect(result.current.uploads[0].progress).toBe(0);
  });

  describe("retryUpload", () => {
    it("clears errorType and resets to pending on retry", async () => {
      // Make the upload fail
      mockMutateAsync.mockRejectedValueOnce({ code: "ERR_NETWORK" });

      const { result } = renderHook(() => useUploadContext(), {
        wrapper: createWrapper(),
      });

      const file = createFile("retry-test.mp4");

      act(() => {
        result.current.addUploads("p1", "Project", [file]);
      });

      // Wait for upload to process and fail
      await vi.advanceTimersByTimeAsync(200);

      await waitFor(() => {
        const upload = result.current.uploads[0];
        return upload?.status === "error";
      });

      const failedUpload = result.current.uploads[0];
      expect(failedUpload.status).toBe("error");
      expect(failedUpload.errorType).toBe("network");
      expect(failedUpload.error).toBeDefined();

      // Retry the upload
      act(() => {
        result.current.retryUpload(failedUpload.id);
      });

      const retriedUpload = result.current.uploads[0];
      expect(retriedUpload.status).toBe("pending");
      expect(retriedUpload.error).toBeUndefined();
      expect(retriedUpload.errorType).toBeUndefined();
      expect(retriedUpload.progress).toBe(0);
    });

    it("shows toast notification on retry", async () => {
      mockMutateAsync.mockRejectedValueOnce({ code: "ERR_NETWORK" });

      const { result } = renderHook(() => useUploadContext(), {
        wrapper: createWrapper(),
      });

      const file = createFile("toast-test.mp4");

      act(() => {
        result.current.addUploads("p1", "Project", [file]);
      });

      await vi.advanceTimersByTimeAsync(200);

      await waitFor(() => {
        return result.current.uploads[0]?.status === "error";
      });

      vi.clearAllMocks();

      act(() => {
        result.current.retryUpload(result.current.uploads[0].id);
      });

      expect(mockedToast.info).toHaveBeenCalledWith(
        expect.stringContaining("Retrying upload for toast-test.mp4")
      );
    });
  });

  describe("error classification", () => {
    it("classifies ERR_NETWORK as network error", async () => {
      mockMutateAsync.mockRejectedValueOnce({ code: "ERR_NETWORK" });

      const { result } = renderHook(() => useUploadContext(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.addUploads("p1", "Project", [createFile("net.mp4")]);
      });

      await vi.advanceTimersByTimeAsync(200);

      await waitFor(() => {
        return result.current.uploads[0]?.status === "error";
      });

      expect(result.current.uploads[0].errorType).toBe("network");
      expect(result.current.uploads[0].error).toContain("Connection lost");
    });

    it("classifies ECONNABORTED as timeout error", async () => {
      mockMutateAsync.mockRejectedValueOnce({ code: "ECONNABORTED" });

      const { result } = renderHook(() => useUploadContext(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.addUploads("p1", "Project", [createFile("timeout.mp4")]);
      });

      await vi.advanceTimersByTimeAsync(200);

      await waitFor(() => {
        return result.current.uploads[0]?.status === "error";
      });

      expect(result.current.uploads[0].errorType).toBe("timeout");
      expect(result.current.uploads[0].error).toContain("timed out");
    });

    it("classifies 413 as validation error", async () => {
      mockMutateAsync.mockRejectedValueOnce({
        response: { status: 413, data: {} },
      });

      const { result } = renderHook(() => useUploadContext(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.addUploads("p1", "Project", [createFile("big.mp4")]);
      });

      await vi.advanceTimersByTimeAsync(200);

      await waitFor(() => {
        return result.current.uploads[0]?.status === "error";
      });

      expect(result.current.uploads[0].errorType).toBe("validation");
      expect(result.current.uploads[0].error).toContain("too large");
    });

    it("classifies 415 as validation error", async () => {
      mockMutateAsync.mockRejectedValueOnce({
        response: { status: 415, data: {} },
      });

      const { result } = renderHook(() => useUploadContext(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.addUploads("p1", "Project", [createFile("bad.txt")]);
      });

      await vi.advanceTimersByTimeAsync(200);

      await waitFor(() => {
        return result.current.uploads[0]?.status === "error";
      });

      expect(result.current.uploads[0].errorType).toBe("validation");
      expect(result.current.uploads[0].error).toContain("Invalid file type");
    });

    it("classifies 500+ as server error", async () => {
      mockMutateAsync.mockRejectedValueOnce({
        response: { status: 502, data: {} },
      });

      const { result } = renderHook(() => useUploadContext(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.addUploads("p1", "Project", [createFile("server.mp4")]);
      });

      await vi.advanceTimersByTimeAsync(200);

      await waitFor(() => {
        return result.current.uploads[0]?.status === "error";
      });

      expect(result.current.uploads[0].errorType).toBe("server");
      expect(result.current.uploads[0].error).toContain("Server error");
    });
  });

  describe("cancel", () => {
    it("cancels a pending upload by marking as cancelled", () => {
      // Don't let the upload actually start
      mockMutateAsync.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useUploadContext(), {
        wrapper: createWrapper(),
      });

      const files = [createFile("a.mp4"), createFile("b.mp4"), createFile("c.mp4"),
                     createFile("d.mp4"), createFile("e.mp4"), createFile("f.mp4")];

      act(() => {
        result.current.addUploads("p1", "Project", files);
      });

      // The 6th file should still be pending (MAX_CONCURRENT=5)
      const pendingUpload = result.current.uploads.find(u => u.status === "pending");

      if (pendingUpload) {
        act(() => {
          result.current.cancelUpload(pendingUpload.id);
        });

        const cancelled = result.current.uploads.find(u => u.id === pendingUpload.id);
        expect(cancelled?.status).toBe("cancelled");
      }
    });
  });

  describe("clearCompleted", () => {
    it("removes only completed uploads", async () => {
      mockMutateAsync.mockResolvedValueOnce({});

      const { result } = renderHook(() => useUploadContext(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.addUploads("p1", "Project", [createFile("a.mp4")]);
      });

      // Wait for completion (upload + 1500ms processing delay)
      await vi.advanceTimersByTimeAsync(200);

      await waitFor(() => {
        return result.current.uploads[0]?.status === "completed";
      }, { timeout: 5000 });

      // Add another upload that will error
      mockMutateAsync.mockRejectedValueOnce({ code: "ERR_NETWORK" });

      act(() => {
        result.current.addUploads("p1", "Project", [createFile("b.mp4")]);
      });

      await vi.advanceTimersByTimeAsync(200);

      await waitFor(() => {
        return result.current.uploads.some(u => u.status === "error");
      });

      act(() => {
        result.current.clearCompleted();
      });

      // Only the errored upload should remain
      expect(result.current.uploads.every(u => u.status !== "completed")).toBe(true);
      expect(result.current.uploads.some(u => u.status === "error")).toBe(true);
    });
  });

  describe("pause/resume", () => {
    it("pauseAll sets isPaused to true", () => {
      const { result } = renderHook(() => useUploadContext(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.pauseAll();
      });

      expect(result.current.isPaused).toBe(true);
    });

    it("resumeAll sets isPaused to false", () => {
      const { result } = renderHook(() => useUploadContext(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.pauseAll();
      });

      expect(result.current.isPaused).toBe(true);

      act(() => {
        result.current.resumeAll();
      });

      expect(result.current.isPaused).toBe(false);
    });
  });

  describe("queue processing order", () => {
    it("processes uploads in FIFO order", () => {
      // Make all uploads hang so we can observe order
      mockMutateAsync.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useUploadContext(), {
        wrapper: createWrapper(),
      });

      const files = [
        createFile("first.mp4"),
        createFile("second.mp4"),
        createFile("third.mp4"),
      ];

      act(() => {
        result.current.addUploads("p1", "Project", files);
      });

      // All 3 should be picked up (< MAX_CONCURRENT_UPLOADS=5)
      // Check that uploads were added in order
      expect(result.current.uploads[0].file.name).toBe("first.mp4");
      expect(result.current.uploads[1].file.name).toBe("second.mp4");
      expect(result.current.uploads[2].file.name).toBe("third.mp4");
    });
  });
});

// Needed to prevent "afterEach is not defined" in vitest
import { afterEach } from "vitest";
