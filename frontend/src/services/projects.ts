import api from "./api";
import type { Project, CreateProjectDto, UpdateProjectDto } from "../types";

export const projectsService = {
  // Get all projects
  getAll: async (): Promise<Project[]> => {
    const response = await api.get("/api/projects/");
    return response.data;
  },

  // Get single project
  getById: async (id: string): Promise<Project> => {
    const response = await api.get(`/api/projects/${id}/`);
    return response.data;
  },

  // Create project
  create: async (data: CreateProjectDto): Promise<Project> => {
    const response = await api.post("/api/projects/", data);
    return response.data;
  },

  // Update project
  update: async (id: string, data: UpdateProjectDto): Promise<Project> => {
    const response = await api.patch(`/api/projects/${id}/`, data);
    return response.data;
  },

  // Delete project
  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/projects/${id}/`);
  },
};
