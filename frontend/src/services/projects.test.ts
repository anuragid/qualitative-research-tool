import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the api module before importing anything that uses it
vi.mock("./api", () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  };
  return { default: mockApi, api: mockApi };
});

import api from "./api";
import { projectsService } from "./projects";
import type { Project, CreateProjectDto, UpdateProjectDto } from "../types";

const mockedApi = vi.mocked(api);

const mockProject: Project = {
  id: "proj-1",
  name: "Test Project",
  description: "A test project",
  created_by: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  status: "planning",
};

describe("projectsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAll", () => {
    it("fetches all projects from /api/projects/", async () => {
      const projects = [mockProject];
      mockedApi.get.mockResolvedValue({ data: projects });

      const result = await projectsService.getAll();

      expect(mockedApi.get).toHaveBeenCalledWith("/api/projects/");
      expect(result).toEqual(projects);
    });

    it("returns empty array when no projects exist", async () => {
      mockedApi.get.mockResolvedValue({ data: [] });

      const result = await projectsService.getAll();

      expect(result).toEqual([]);
    });

    it("propagates errors from api", async () => {
      mockedApi.get.mockRejectedValue({ status: 500, message: "Server error" });

      await expect(projectsService.getAll()).rejects.toEqual({
        status: 500,
        message: "Server error",
      });
    });
  });

  describe("getById", () => {
    it("fetches a project by id", async () => {
      mockedApi.get.mockResolvedValue({ data: mockProject });

      const result = await projectsService.getById("proj-1");

      expect(mockedApi.get).toHaveBeenCalledWith("/api/projects/proj-1");
      expect(result).toEqual(mockProject);
    });

    it("propagates 404 errors", async () => {
      mockedApi.get.mockRejectedValue({ status: 404, message: "Not found" });

      await expect(projectsService.getById("nonexistent")).rejects.toEqual({
        status: 404,
        message: "Not found",
      });
    });
  });

  describe("create", () => {
    it("posts a new project", async () => {
      const createDto: CreateProjectDto = {
        name: "New Project",
        description: "A new project",
      };
      mockedApi.post.mockResolvedValue({ data: { ...mockProject, ...createDto } });

      const result = await projectsService.create(createDto);

      expect(mockedApi.post).toHaveBeenCalledWith("/api/projects/", createDto);
      expect(result.name).toBe("New Project");
    });

    it("creates a project with minimal data", async () => {
      const createDto: CreateProjectDto = { name: "Minimal" };
      mockedApi.post.mockResolvedValue({
        data: { ...mockProject, name: "Minimal" },
      });

      const result = await projectsService.create(createDto);

      expect(mockedApi.post).toHaveBeenCalledWith("/api/projects/", createDto);
      expect(result.name).toBe("Minimal");
    });
  });

  describe("update", () => {
    it("patches an existing project", async () => {
      const updateDto: UpdateProjectDto = { name: "Updated Name" };
      mockedApi.patch.mockResolvedValue({
        data: { ...mockProject, name: "Updated Name" },
      });

      const result = await projectsService.update("proj-1", updateDto);

      expect(mockedApi.patch).toHaveBeenCalledWith(
        "/api/projects/proj-1",
        updateDto
      );
      expect(result.name).toBe("Updated Name");
    });

    it("updates project status", async () => {
      const updateDto: UpdateProjectDto = { status: "archived" };
      mockedApi.patch.mockResolvedValue({
        data: { ...mockProject, status: "archived" },
      });

      const result = await projectsService.update("proj-1", updateDto);

      expect(result.status).toBe("archived");
    });
  });

  describe("delete", () => {
    it("deletes a project by id", async () => {
      mockedApi.delete.mockResolvedValue({});

      await projectsService.delete("proj-1");

      expect(mockedApi.delete).toHaveBeenCalledWith("/api/projects/proj-1");
    });

    it("propagates errors from api", async () => {
      mockedApi.delete.mockRejectedValue({ status: 404, message: "Not found" });

      await expect(projectsService.delete("nonexistent")).rejects.toEqual({
        status: 404,
        message: "Not found",
      });
    });
  });
});
