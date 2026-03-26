import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useUploadVideo } from '../hooks/useVideos';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { CancelTokenSource } from 'axios';
import { toast } from 'sonner';

export interface FileUploadStatus {
  id: string;
  projectId: string;
  projectName: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error' | 'cancelled' | 'paused';
  error?: string;
  errorType?: 'network' | 'timeout' | 'server' | 'validation' | 'unknown';
  uploadedBytes?: number;
  uploadSpeed?: number;
  startTime?: number;
  eta?: number;
  cancelToken?: CancelTokenSource;
  // Progress preservation for pause/resume
  pausedProgress?: number;
  pausedUploadedBytes?: number;
  pausedAt?: number;
  wasPaused?: boolean;
  // Processing state info
  processingMessage?: string;
  processingStartTime?: number;
}

interface UploadContextType {
  uploads: FileUploadStatus[];
  activeUploads: number;
  addUploads: (projectId: string, projectName: string, files: File[]) => void;
  removeUpload: (id: string) => void;
  retryUpload: (id: string) => void;
  clearCompleted: () => void;
  isUploading: boolean;
  cancelUpload: (id: string) => void;
  pauseUpload: (id: string) => void;
  resumeUpload: (id: string) => void;
  pauseAll: () => void;
  resumeAll: () => void;
  isPaused: boolean;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function useUploadContext() {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUploadContext must be used within UploadProvider');
  }
  return context;
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<FileUploadStatus[]>([]);
  const uploadMutation = useUploadVideo();
  const queryClient = useQueryClient();
  const uploadQueueRef = useRef<string[]>([]);
  const activeUploadsRef = useRef<Set<string>>(new Set());
  const uploadsRef = useRef<FileUploadStatus[]>([]);
  const queuePausedRef = useRef(false);
  const [isPaused, setIsPaused] = useState(false);

  // Fixed concurrent upload limit for optimal performance
  const MAX_CONCURRENT_UPLOADS = 5; // Balanced for performance without overwhelming the server

  // Keep ref in sync with state
  uploadsRef.current = uploads;

  const activeUploads = uploads.filter(u => u.status === 'uploading').length;
  const isUploading = activeUploads > 0;

  // Use ref to avoid circular dependency
  const processQueueRef = useRef<(() => Promise<void>) | null>(null);

  const processIndividualUpload = useCallback(async (pendingUpload: FileUploadStatus) => {
    const uploadId = pendingUpload.id;

    // Mark as active
    activeUploadsRef.current.add(uploadId);

    // Create cancel token for this upload
    const cancelTokenSource = axios.CancelToken.source();

    // Update status to uploading with cancel token
    const startTime = Date.now();
    setUploads(prev => prev.map(u =>
      u.id === uploadId
        ? { ...u, status: 'uploading' as const, startTime, cancelToken: cancelTokenSource }
        : u
    ));

    try {
      await uploadMutation.mutateAsync({
        projectId: pendingUpload.projectId,
        file: pendingUpload.file,
        cancelToken: cancelTokenSource.token,
        onProgress: (progress, loaded, total) => {
          const now = Date.now();
          const elapsed = (now - startTime) / 1000;
          const uploadSpeed = elapsed > 0 ? loaded / elapsed : 0;
          const remainingBytes = total - loaded;
          const eta = uploadSpeed > 0 ? remainingBytes / uploadSpeed : Infinity;

          setUploads(prev => prev.map(u =>
            u.id === uploadId
              ? {
                  ...u,
                  progress,
                  uploadedBytes: loaded,
                  uploadSpeed,
                  eta
                }
              : u
          ));
        },
      });

      // Mark as processing (server-side processing after upload)
      setUploads(prev => prev.map(u =>
        u.id === uploadId
          ? {
              ...u,
              status: 'processing' as const,
              progress: 100,
              processingMessage: 'Processing file on server...',
              processingStartTime: Date.now()
            }
          : u
      ));

      // Brief delay to ensure state updates propagate before marking completed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Mark as completed
      setUploads(prev => prev.map(u =>
        u.id === uploadId
          ? {
              ...u,
              status: 'completed' as const,
              progress: 100,
              processingMessage: undefined,
              processingStartTime: undefined
            }
          : u
      ));

      // Invalidate queries for the project - force refetch immediately
      queryClient.invalidateQueries({
        queryKey: ['projects', pendingUpload.projectId, 'videos'],
      });

      // Also refetch the data immediately to ensure videos appear
      queryClient.refetchQueries({
        queryKey: ['projects', pendingUpload.projectId, 'videos'],
      });

      // Show notification
      showNotification('success', `${pendingUpload.file.name} uploaded successfully`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // Check if the upload was cancelled
      if (axios.isCancel(error)) {
        const cancelMessage = error.message || 'User cancelled upload';

        // Check if this was a pause or a cancel
        const isPaused = cancelMessage.includes('paused');

        if (!isPaused) {
          setUploads(prev => prev.map(u =>
            u.id === uploadId
              ? {
                  ...u,
                  status: 'cancelled' as const,
                  error: 'Upload cancelled',
                  cancelToken: undefined
                }
              : u
          ));
          showNotification('info', `Upload cancelled: ${pendingUpload.file.name}`);
        }
      } else {
        let errorMessage = 'Upload failed';
        let errorType: 'network' | 'timeout' | 'server' | 'validation' | 'unknown' = 'unknown';

        if (error?.code === 'ERR_NETWORK') {
          errorMessage = 'Connection lost. Check your internet and try again.';
          errorType = 'network';
        } else if (error?.code === 'ECONNABORTED') {
          errorMessage = 'Upload timed out. Try a smaller file or check your connection speed.';
          errorType = 'timeout';
        } else if (error?.response?.status === 413) {
          errorMessage = 'File too large. Maximum size is 5GB.';
          errorType = 'validation';
        } else if (error?.response?.status === 415) {
          errorMessage = 'Invalid file type. Only video and audio files are accepted.';
          errorType = 'validation';
        } else if (error?.response?.status >= 500) {
          errorMessage = 'Server error. Please try again in a few moments.';
          errorType = 'server';
        } else if (error?.response?.data?.detail) {
          errorMessage = error.response.data.detail;
          errorType = error.response.status >= 500 ? 'server' : 'validation';
        } else if (error?.message) {
          errorMessage = error.message;
        }

        setUploads(prev => prev.map(u =>
          u.id === uploadId
            ? {
                ...u,
                status: 'error' as const,
                error: errorMessage,
                errorType
              }
            : u
        ));

        // Show error notification
        showNotification('error', `Failed to upload ${pendingUpload.file.name}`);
      }
    }

    // Remove from active uploads and queue
    activeUploadsRef.current.delete(uploadId);
    uploadQueueRef.current = uploadQueueRef.current.filter(id => id !== uploadId);

    // Process next uploads in queue
    setTimeout(() => processQueueRef.current?.(), 100);
  }, [uploadMutation, queryClient]);

  const processUploadQueue = useCallback(async () => {
    // Check if queue is paused
    if (queuePausedRef.current) {
      return;
    }

    // Clean up queue - remove any IDs that don't have corresponding uploads
    uploadQueueRef.current = uploadQueueRef.current.filter(id =>
      uploadsRef.current.some(u => u.id === id && u.status === 'pending')
    );

    // Check how many uploads are currently active
    const currentActiveCount = activeUploadsRef.current.size;

    // Calculate how many more uploads we can start
    const slotsAvailable = MAX_CONCURRENT_UPLOADS - currentActiveCount;

    if (slotsAvailable <= 0) {
      // Already at max concurrent uploads
      return;
    }

    // Find pending uploads that aren't already being processed
    const pendingUploads = uploadsRef.current.filter(u =>
      u.status === 'pending' &&
      uploadQueueRef.current.includes(u.id) &&
      !activeUploadsRef.current.has(u.id)
    ).slice(0, slotsAvailable);

    if (pendingUploads.length === 0) {
      // No pending uploads
      return;
    }

    // Start uploads in parallel (up to the limit)
    pendingUploads.forEach(pendingUpload => {
      processIndividualUpload(pendingUpload);
    });
  }, [processIndividualUpload]);

  // Assign to ref
  processQueueRef.current = processUploadQueue;

  const addUploads = useCallback((projectId: string, projectName: string, files: File[]) => {
    const newUploads: FileUploadStatus[] = files.map(file => ({
      id: `${Date.now()}-${Math.random()}`,
      projectId,
      projectName,
      file,
      progress: 0,
      status: 'pending' as const,
    }));

    setUploads(prev => [...prev, ...newUploads]);

    // Add to queue avoiding duplicates
    newUploads.forEach(upload => {
      if (!uploadQueueRef.current.includes(upload.id)) {
        uploadQueueRef.current.push(upload.id);
      }
    });

    // Start processing if not already
    setTimeout(() => processUploadQueue(), 100);
  }, [processUploadQueue]);

  const removeUpload = useCallback((id: string) => {
    setUploads(prev => prev.filter(u => {
      if (u.id === id && u.status === 'uploading') {
        return true; // Can't remove while uploading
      }
      return u.id !== id;
    }));
    uploadQueueRef.current = uploadQueueRef.current.filter(uid => uid !== id);
  }, []);

  const retryUpload = useCallback((id: string) => {
    const upload = uploadsRef.current.find(u => u.id === id);
    if (upload?.status === 'error') {
      showNotification('info', `Retrying upload for ${upload.file.name}...`);
    }

    setUploads(prev => prev.map(u =>
      u.id === id && u.status === 'error'
        ? { ...u, status: 'pending' as const, error: undefined, errorType: undefined, progress: 0 }
        : u
    ));

    if (!uploadQueueRef.current.includes(id)) {
      uploadQueueRef.current.push(id);
    }

    setTimeout(() => processUploadQueue(), 100);
  }, [processUploadQueue]);

  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => u.status !== 'completed'));
  }, []);

  const cancelUpload = useCallback((id: string) => {
    const upload = uploadsRef.current.find(u => u.id === id);
    if (upload?.status === 'uploading' && upload.cancelToken) {
      // Cancel the axios request
      upload.cancelToken.cancel('User cancelled upload');
    } else if (upload?.status === 'pending') {
      // Remove from queue if pending
      uploadQueueRef.current = uploadQueueRef.current.filter(uid => uid !== id);
      setUploads(prev => prev.map(u =>
        u.id === id
          ? { ...u, status: 'cancelled' as const, error: 'Upload cancelled' }
          : u
      ));
    } else if (upload?.status === 'paused') {
      // Cancel paused upload
      setUploads(prev => prev.map(u =>
        u.id === id
          ? { ...u, status: 'cancelled' as const, error: 'Upload cancelled', cancelToken: undefined }
          : u
      ));
    }
  }, []);

  const pauseUpload = useCallback((id: string) => {
    const upload = uploadsRef.current.find(u => u.id === id);
    if (upload?.status === 'uploading' && upload.cancelToken) {
      // Cancel the current upload but preserve progress
      upload.cancelToken.cancel('User paused upload');
      setUploads(prev => prev.map(u =>
        u.id === id
          ? {
              ...u,
              status: 'paused' as const,
              cancelToken: undefined,
              // Preserve current progress
              pausedProgress: u.progress,
              pausedUploadedBytes: u.uploadedBytes,
              pausedAt: Date.now(),
              wasPaused: true
            }
          : u
      ));
    } else if (upload?.status === 'pending') {
      // Remove from queue and mark as paused
      uploadQueueRef.current = uploadQueueRef.current.filter(uid => uid !== id);
      setUploads(prev => prev.map(u =>
        u.id === id
          ? {
              ...u,
              status: 'paused' as const,
              pausedAt: Date.now(),
              wasPaused: true
            }
          : u
      ));
    }
  }, []);

  const resumeUpload = useCallback((id: string) => {
    const upload = uploadsRef.current.find(u => u.id === id);
    if (upload?.status === 'paused') {
      // Keep paused progress visible while moving to pending
      // Note: Actual upload will restart from 0% due to HTTP limitations
      setUploads(prev => prev.map(u =>
        u.id === id
          ? {
              ...u,
              status: 'pending' as const,
              // Keep visual progress (will show "Resuming from X%")
              progress: 0,  // Actual progress starts from 0
              uploadedBytes: 0,
              uploadSpeed: 0,
              eta: undefined,
              // Keep paused data to show user where they left off
              wasPaused: true
              // pausedProgress and pausedUploadedBytes remain
            }
          : u
      ));

      if (!uploadQueueRef.current.includes(id)) {
        uploadQueueRef.current.push(id);
      }

      // Start processing if queue isn't paused
      if (!queuePausedRef.current) {
        setTimeout(() => processUploadQueue(), 100);
      }
    }
  }, [processUploadQueue]);

  const pauseAll = useCallback(() => {
    queuePausedRef.current = true;
    setIsPaused(true);

    // Cancel all active uploads
    uploadsRef.current.forEach(upload => {
      if (upload.status === 'uploading' && upload.cancelToken) {
        upload.cancelToken.cancel('Queue paused');
      }
    });

    // Clear active uploads tracking
    activeUploadsRef.current.clear();

    // Mark all uploading as paused
    setUploads(prev => prev.map(u =>
      u.status === 'uploading'
        ? { ...u, status: 'paused' as const, cancelToken: undefined }
        : u
    ));
  }, []);

  const resumeAll = useCallback(() => {
    queuePausedRef.current = false;
    setIsPaused(false);

    // Convert all paused uploads to pending while keeping paused data
    setUploads(prev => prev.map(u =>
      u.status === 'paused'
        ? {
            ...u,
            status: 'pending' as const,
            progress: 0,
            uploadedBytes: 0,
            uploadSpeed: 0,
            eta: undefined,
            // Keep paused data to show where they left off
            wasPaused: true
            // pausedProgress and pausedUploadedBytes remain
          }
        : u
    ));

    // Add paused uploads back to queue
    const pausedUploads = uploadsRef.current.filter(u => u.status === 'paused');
    pausedUploads.forEach(upload => {
      if (!uploadQueueRef.current.includes(upload.id)) {
        uploadQueueRef.current.push(upload.id);
      }
    });

    // Start processing
    setTimeout(() => processUploadQueue(), 100);
  }, [processUploadQueue]);

  return (
    <UploadContext.Provider
      value={{
        uploads,
        activeUploads,
        addUploads,
        removeUpload,
        retryUpload,
        clearCompleted,
        isUploading,
        cancelUpload,
        pauseUpload,
        resumeUpload,
        pauseAll,
        resumeAll,
        isPaused,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}

function showNotification(type: 'success' | 'error' | 'info', message: string) {
  if (type === 'success') toast.success(message);
  else if (type === 'error') toast.error(message);
  else toast.info(message);
}