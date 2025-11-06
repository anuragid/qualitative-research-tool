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
    const response = await api.get(`/api/videos/${videoId}/analysis`);
    return response.data?.chunks || [];
  },

  getVideoInferences: async (videoId: string) => {
    const response = await api.get(`/api/videos/${videoId}/analysis`);
    return response.data?.inferences || [];
  },

  getVideoPatterns: async (videoId: string) => {
    const response = await api.get(`/api/videos/${videoId}/analysis`);
    return response.data?.patterns || [];
  },

  getVideoInsights: async (videoId: string) => {
    const response = await api.get(`/api/videos/${videoId}/analysis`);
    return response.data?.insights || [];
  },

  getVideoPrinciples: async (videoId: string) => {
    const response = await api.get(`/api/videos/${videoId}/analysis`);
    return response.data?.design_principles || [];
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
    const response = await api.get(`/api/projects/${projectId}/analysis`);
    return response.data?.cross_video_patterns || [];
  },

  getCrossInsights: async (projectId: string) => {
    const response = await api.get(`/api/projects/${projectId}/analysis`);
    return response.data?.cross_video_insights || [];
  },

  getSystemPrinciples: async (projectId: string) => {
    const response = await api.get(`/api/projects/${projectId}/analysis`);
    return response.data?.cross_video_principles || [];
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
