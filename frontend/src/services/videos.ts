import api from "./api";
import type { Video } from "../types";

export const videosService = {
  // Get videos for a project
  getByProject: async (projectId: string): Promise<Video[]> => {
    const response = await api.get(`/api/projects/${projectId}/videos/`);
    return response.data;
  },

  // Get single video
  getById: async (id: string): Promise<Video> => {
    const response = await api.get(`/api/videos/${id}/`);
    return response.data;
  },

  // Upload video (multipart form data)
  upload: async (
    projectId: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<Video> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await api.post(
      `/api/videos/${projectId}/upload/`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percentCompleted);
          }
        },
      }
    );
    return response.data;
  },

  // Delete video
  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/videos/${id}/`);
  },

  // Download video (returns pre-signed URL)
  getDownloadUrl: async (id: string): Promise<string> => {
    const response = await api.get(`/api/videos/${id}/download/`);
    return response.data.download_url;
  },
};
