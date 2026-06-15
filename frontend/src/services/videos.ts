import api from "./api";
import type { CancelToken } from "axios";
import type { Video } from "../types";

export const videosService = {
  // Get videos for a project
  getByProject: async (projectId: string): Promise<Video[]> => {
    const response = await api.get(`/api/projects/${projectId}/videos`);
    return response.data;
  },

  // Get single video
  getById: async (id: string): Promise<Video> => {
    const response = await api.get(`/api/videos/${id}`);
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

  // Confirm upload completed. Accepts an optional extended timeout because this
  // endpoint is also used as a recovery probe after XHR/network failures — R2
  // head_object can take longer on a freshly-written key, and we don't want the
  // shared 30s axios timeout to mask a successful upload.
  confirmUpload: async (videoId: string, timeoutMs?: number): Promise<Video> => {
    const response = await api.post(
      `/api/videos/${videoId}/confirm-upload`,
      undefined,
      timeoutMs ? { timeout: timeoutMs } : undefined,
    );
    return response.data;
  },

  // Upload file directly to R2 using presigned URL.
  //
  // The happy path is a 3-step flow: (1) get presigned URL, (2) XHR PUT to R2,
  // (3) POST confirm-upload. Both step 2 and step 3 can fail in ways where the
  // bytes actually landed in R2 — most commonly an HTTP/2 idle close or flaky
  // connection that rejects the XHR after R2 has the full object, or a slow
  // head_object call on a freshly-written key that exceeds the axios 30s
  // timeout. We do NOT want to report these as user-visible failures because
  // the video is perfectly usable.
  //
  // Recovery strategy: on any step-2 or step-3 failure, probe confirm-upload
  // with an extended timeout. If it returns 200, the upload succeeded after
  // all — we propagate success. If it also fails, we rethrow the original
  // error so the user sees the actual error and can retry.
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

    // Step 2: Upload directly to R2. Wrap in try/catch so we can probe recovery.
    let step2Error: unknown = null;
    let userCancelled = false;
    try {
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
            userCancelled = true;
            xhr.abort();
            reject(new Error("Upload cancelled"));
          });
        }

        xhr.send(file);
      });
    } catch (err) {
      // If the user explicitly cancelled, don't probe — let the cancellation propagate.
      if (userCancelled) throw err;
      step2Error = err;
    }

    // Step 3: Confirm upload with backend, with recovery probe behavior.
    // Use extended timeout (120s) because head_object on a freshly-written R2
    // key can be slow, and we're potentially probing after a failure.
    try {
      return await videosService.confirmUpload(video_id, 120000);
    } catch (confirmError) {
      // If step 2 already failed AND step 3 failed, report the original step 2
      // error — that's the actual reason the upload didn't complete.
      if (step2Error) throw step2Error;
      // Step 2 succeeded but step 3 failed — this is rarer but still possible
      // (e.g., network blip during the confirm POST). Report the confirm error.
      throw confirmError;
    }
  },

  // Delete video
  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/videos/${id}`);
  },

  // Get playback URL (returns pre-signed URL for streaming)
  getPlaybackUrl: async (id: string): Promise<string> => {
    const response = await api.get(`/api/videos/${id}/playback-url`);
    return response.data.playback_url;
  },
};
