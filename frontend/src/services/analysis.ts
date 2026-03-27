import api from "./api";
import type { VideoAnalysis, ProjectAnalysis, AnalysisStatusResponse } from "../types";

export const analysisService = {
  // Video Analysis
  startVideoAnalysis: async (videoId: string): Promise<{ task_id: string }> => {
    const response = await api.post(`/api/videos/${videoId}/analyze`);
    return response.data;
  },

  // Step-by-step analysis
  startChunkStep: async (videoId: string): Promise<{ task_id: string }> => {
    const response = await api.post(`/api/videos/${videoId}/analyze/chunk`);
    return response.data;
  },

  startInferStep: async (videoId: string): Promise<{ task_id: string }> => {
    const response = await api.post(`/api/videos/${videoId}/analyze/infer`);
    return response.data;
  },

  startRelateStep: async (videoId: string): Promise<{ task_id: string }> => {
    const response = await api.post(`/api/videos/${videoId}/analyze/relate`);
    return response.data;
  },

  startExplainStep: async (videoId: string): Promise<{ task_id: string }> => {
    const response = await api.post(`/api/videos/${videoId}/analyze/explain`);
    return response.data;
  },

  startActivateStep: async (videoId: string): Promise<{ task_id: string }> => {
    const response = await api.post(`/api/videos/${videoId}/analyze/activate`);
    return response.data;
  },

  getVideoAnalysisStatus: async (videoId: string): Promise<AnalysisStatusResponse> => {
    const response = await api.get(`/api/videos/${videoId}/analysis/status`);
    return response.data;
  },

  getVideoAnalysis: async (videoId: string): Promise<VideoAnalysis> => {
    const response = await api.get(`/api/videos/${videoId}/analysis`);
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

  // getMetaPatterns, getCrossInsights, getSystemPrinciples removed —
  // hooks now share the getProjectAnalysis query with `select` to avoid 4x fetch.

};
