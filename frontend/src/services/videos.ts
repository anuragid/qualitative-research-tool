import api from "./api";
import type { CancelToken } from "axios";
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
    onProgress?: (progress: number, loaded: number, total: number) => void,
    cancelToken?: CancelToken
  ): Promise<Video> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await api.post(
      `/api/videos/${projectId}/upload`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 600000, // 10 minutes timeout for large video uploads
        cancelToken: cancelToken,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percentCompleted, progressEvent.loaded, progressEvent.total);
          }
        },
      }
    );
    return response.data;
  },

  // Get presigned upload URL for direct R2 upload
  getUploadUrl: async (
    projectId: string,
    filename: string,
    fileSize: number,
    contentType: string
  ): Promise<{ upload_url: string; s3_key: string; video_id: string }> => {
    const response = await api.post(`/api/videos/${projectId}/upload-url`, {
      filename,
      file_size: fileSize,
      content_type: contentType,
    });
    return response.data;
  },

  // Confirm upload completed
  confirmUpload: async (videoId: string): Promise<Video> => {
    const response = await api.post(`/api/videos/${videoId}/confirm-upload`);
    return response.data;
  },

  // Upload file directly to R2 using presigned URL
  uploadDirect: async (
    projectId: string,
    file: File,
    onProgress?: (progress: number, loaded: number, total: number) => void,
    cancelToken?: CancelToken
  ): Promise<Video> => {
    // Step 1: Get presigned URL from backend
    const { upload_url, video_id } = await videosService.getUploadUrl(
      projectId,
      file.name,
      file.size,
      file.type || "video/mp4"
    );

    // Step 2: Upload directly to R2
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", upload_url);
      xhr.setRequestHeader("Content-Type", file.type || "video/mp4");

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded * 100) / event.total);
          onProgress(percent, event.loaded, event.total);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`R2 upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.ontimeout = () => reject(new Error("Upload timed out"));

      // Support cancellation
      if (cancelToken) {
        cancelToken.promise.then(() => {
          xhr.abort();
          reject(new Error("Upload cancelled"));
        });
      }

      xhr.send(file);
    });

    // Step 3: Confirm upload with backend
    return videosService.confirmUpload(video_id);
  },

  // Delete video
  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/videos/${id}/`);
  },

  // Get playback URL (returns pre-signed URL for streaming)
  getPlaybackUrl: async (id: string): Promise<string> => {
    const response = await api.get(`/api/videos/${id}/playback-url`);
    return response.data.playback_url;
  },
};
