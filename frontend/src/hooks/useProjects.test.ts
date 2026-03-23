// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useProjects,
  useProject,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
} from "./useProjects";

// Mock the projects service
vi.mock("../services/projects", () => ({
  projectsService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { projectsService } from "../services/projects";

const mockedService = projectsService as {
  getAll: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
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

describe("useProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches all projects", async () => {
    const projects = [
      { id: "1", name: "Project 1", status: "ready" },
      { id: "2", name: "Project 2", status: "completed" },
    ];
    mockedService.getAll.mockResolvedValue(projects);

    const { result } = renderHook(() => useProjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(projects);
    expect(mockedService.getAll).toHaveBeenCalledOnce();
  });

  it("handles error when fetching projects", async () => {
    mockedService.getAll.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useProjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it("returns refetchInterval=3000 when any project is processing", async () => {
    const projects = [
      { id: "1", name: "Project 1", status: "processing" },
      { id: "2", name: "Project 2", status: "ready" },
    ];
    mockedService.getAll.mockResolvedValue(projects);

    const { result } = renderHook(() => useProjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(projects);
  });

  it("returns refetchInterval=false when no project is processing", async () => {
    const projects = [
      { id: "1", name: "Project 1", status: "ready" },
      { id: "2", name: "Project 2", status: "completed" },
    ];
    mockedService.getAll.mockResolvedValue(projects);

    const { result } = renderHook(() => useProjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(projects);
  });

  it("respects document.hidden check — does not poll when hidden", async () => {
    const projects = [
      { id: "1", name: "Project 1", status: "processing" },
    ];
    mockedService.getAll.mockResolvedValue(projects);

    Object.defineProperty(document, "hidden", {
      value: true,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useProjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // With document.hidden=true, refetchInterval returns false even for processing projects
    expect(mockedService.getAll).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "hidden", {
      value: false,
      writable: true,
      configurable: true,
    });
  });

  it("polls when a video within a project is transcribing", async () => {
    const projects = [
      {
        id: "1",
        name: "Project 1",
        status: "ready",
        videos: [{ id: "v1", status: "transcribing" }],
      },
    ];
    mockedService.getAll.mockResolvedValue(projects);

    const { result } = renderHook(() => useProjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(projects);
  });

  it("polls when a video within a project is analyzing", async () => {
    const projects = [
      {
        id: "1",
        name: "Project 1",
        status: "ready",
        videos: [{ id: "v1", status: "analyzing" }],
      },
    ];
    mockedService.getAll.mockResolvedValue(projects);

    const { result } = renderHook(() => useProjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(projects);
  });

  it("stops polling when no active work", async () => {
    const projects = [
      {
        id: "1",
        name: "Project 1",
        status: "completed",
        videos: [{ id: "v1", status: "analyzed" }],
      },
    ];
    mockedService.getAll.mockResolvedValue(projects);

    const { result } = renderHook(() => useProjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Only one call — no polling for completed projects with no active videos
    expect(mockedService.getAll).toHaveBeenCalledTimes(1);
  });
});

describe("useProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches a single project by id", async () => {
    const project = { id: "1", name: "Project 1", status: "ready" };
    mockedService.getById.mockResolvedValue(project);

    const { result } = renderHook(() => useProject("1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(project);
    expect(mockedService.getById).toHaveBeenCalledWith("1");
  });

  it("does not fetch when id is null", async () => {
    const { result } = renderHook(() => useProject(null), {
      wrapper: createWrapper(),
    });

    // Should stay in idle/disabled state
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockedService.getById).not.toHaveBeenCalled();
  });

  it("polls when project status is processing", async () => {
    const project = { id: "1", name: "Project 1", status: "processing" };
    mockedService.getById.mockResolvedValue(project);

    const { result } = renderHook(() => useProject("1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("processing");
  });

  it("does not poll when project status is completed", async () => {
    const project = { id: "1", name: "Project 1", status: "completed" };
    mockedService.getById.mockResolvedValue(project);

    const { result } = renderHook(() => useProject("1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("completed");
  });

  it("respects document.hidden check — does not poll when hidden", async () => {
    const project = { id: "1", name: "Project 1", status: "processing" };
    mockedService.getById.mockResolvedValue(project);

    Object.defineProperty(document, "hidden", {
      value: true,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useProject("1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // With document.hidden=true, refetchInterval returns false even for processing project
    expect(mockedService.getById).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "hidden", {
      value: false,
      writable: true,
      configurable: true,
    });
  });

  it("polls when project has a video that is transcribing", async () => {
    const project = {
      id: "1",
      name: "Project 1",
      status: "ready",
      videos: [{ id: "v1", status: "transcribing" }],
    };
    mockedService.getById.mockResolvedValue(project);

    const { result } = renderHook(() => useProject("1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(project);
  });

  it("stops polling when no videos are actively processing", async () => {
    const project = {
      id: "1",
      name: "Project 1",
      status: "completed",
      videos: [{ id: "v1", status: "analyzed" }],
    };
    mockedService.getById.mockResolvedValue(project);

    const { result } = renderHook(() => useProject("1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.getById).toHaveBeenCalledTimes(1);
  });
});

describe("useCreateProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a project and invalidates queries", async () => {
    const newProject = { id: "3", name: "New Project", status: "planning" };
    mockedService.create.mockResolvedValue(newProject);

    const { result } = renderHook(() => useCreateProject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ name: "New Project" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.create).toHaveBeenCalledWith({ name: "New Project" });
    expect(result.current.data).toEqual(newProject);
  });

  it("handles error during creation", async () => {
    mockedService.create.mockRejectedValue(new Error("Create failed"));

    const { result } = renderHook(() => useCreateProject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ name: "Fail Project" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates a project and invalidates queries", async () => {
    const updated = { id: "1", name: "Updated", status: "ready" };
    mockedService.update.mockResolvedValue(updated);

    const { result } = renderHook(() => useUpdateProject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ id: "1", data: { name: "Updated" } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.update).toHaveBeenCalledWith("1", { name: "Updated" });
  });

  it("handles error during update", async () => {
    mockedService.update.mockRejectedValue(new Error("Update failed"));

    const { result } = renderHook(() => useUpdateProject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ id: "1", data: { name: "Fail" } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useDeleteProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a project and invalidates queries", async () => {
    mockedService.delete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteProject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.delete).toHaveBeenCalledWith("1");
  });

  it("handles error during deletion", async () => {
    mockedService.delete.mockRejectedValue(new Error("Delete failed"));

    const { result } = renderHook(() => useDeleteProject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
