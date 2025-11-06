import api from "./api";
import type { VideoAnalysis, ProjectAnalysis, AnalysisTask } from "../types";

export const analysisService = {
  // Video Analysis
  startVideoAnalysis: async (videoId: string): Promise<{ task_id: string }> => {
    const response = await api.post(`/api/videos/${videoId}/analyze`);
    return response.data;
  },

  getVideoAnalysis: async (videoId: string): Promise<VideoAnalysis> => {
    const response = await api.get(`/api/videos/${videoId}/analysis`);
    return response.data;
  },

  getVideoChunks: async (videoId: string) => {
    const response = await api.get(`/api/videos/${videoId}/analysis/chunks`);
    return response.data;
  },

  getVideoInferences: async (videoId: string) => {
    const response = await api.get(
      `/api/videos/${videoId}/analysis/inferences`
    );
    return response.data;
  },

  getVideoPatterns: async (videoId: string) => {
    const response = await api.get(`/api/videos/${videoId}/analysis/patterns`);
    return response.data;
  },

  getVideoInsights: async (videoId: string) => {
    const response = await api.get(`/api/videos/${videoId}/analysis/insights`);
    return response.data;
  },

  getVideoPrinciples: async (videoId: string) => {
    const response = await api.get(
      `/api/videos/${videoId}/analysis/principles`
    );
    return response.data;
  },

  // Project Analysis (Cross-Video)
  startProjectAnalysis: async (
    projectId: string
  ): Promise<{ task_id: string }> => {
    const response = await api.post(`/api/projects/${projectId}/analyze`);
    return response.data;
  },

  getProjectAnalysis: async (projectId: string): Promise<ProjectAnalysis> => {
    const response = await api.get(`/api/projects/${projectId}/analysis`);
    return response.data;
  },

  getMetaPatterns: async (projectId: string) => {
    const response = await api.get(
      `/api/projects/${projectId}/analysis/meta-patterns`
    );
    return response.data;
  },

  getCrossInsights: async (projectId: string) => {
    const response = await api.get(
      `/api/projects/${projectId}/analysis/cross-insights`
    );
    return response.data;
  },

  getSystemPrinciples: async (projectId: string) => {
    const response = await api.get(
      `/api/projects/${projectId}/analysis/system-principles`
    );
    return response.data;
  },

  // Task monitoring
  getTaskStatus: async (taskId: string): Promise<AnalysisTask> => {
    const response = await api.get(`/api/tasks/${taskId}/status`);
    return response.data;
  },

  cancelTask: async (taskId: string): Promise<void> => {
    await api.post(`/api/tasks/${taskId}/cancel`);
  },
};
