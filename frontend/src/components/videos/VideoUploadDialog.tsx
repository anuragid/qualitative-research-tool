import { useState, useCallback, useEffect } from "react";
import { Upload, X, FileVideo, Loader2, CheckCircle, AlertCircle, RotateCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Progress } from "../ui/Progress";
import { useUploadVideo } from "../../hooks/useVideos";

interface VideoUploadDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFiles?: File[];
}

interface FileUploadStatus {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

export default function VideoUploadDialog({
  projectId,
  open,
  onOpenChange,
  initialFiles = [],
}: VideoUploadDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<FileUploadStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0);
  const uploadMutation = useUploadVideo();

  // Process initial files when dialog opens
  useEffect(() => {
    if (initialFiles.length > 0 && open) {
      const videoFiles = initialFiles.filter((file) => file.type.startsWith("video/"));
      if (videoFiles.length > 0) {
        setSelectedFiles(videoFiles.map(file => ({
          file,
          progress: 0,
          status: 'pending' as const
        })));
      }
    }
  }, [open, initialFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const videoFiles = files.filter((file) => file.type.startsWith("video/"));

    if (videoFiles.length > 0) {
      const newFiles = videoFiles.map(file => ({
        file,
        progress: 0,
        status: 'pending' as const
      }));

      // Always append to existing files
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      const videoFiles = files.filter((file) => file.type.startsWith("video/"));

      if (videoFiles.length > 0) {
        const newFiles = videoFiles.map(file => ({
          file,
          progress: 0,
          status: 'pending' as const
        }));

        // Always append to existing files
        setSelectedFiles(prev => [...prev, ...newFiles]);
      }
    },
    []
  );

  const removeFile = (index: number) => {
    if (selectedFiles[index].status === 'uploading') return; // Can't remove while uploading
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const retryFile = async (index: number) => {
    if (selectedFiles[index].status !== 'error' || isUploading) return;

    // Reset the file status to pending
    setSelectedFiles(prev => prev.map((f, i) =>
      i === index ? { ...f, status: 'pending', error: undefined, progress: 0 } : f
    ));

    // Start uploading just this file
    setIsUploading(true);
    await uploadNextFile(index);
  };

  const retryAllFailed = async () => {
    if (isUploading) return;

    // Find all failed files before resetting
    const failedIndexes = selectedFiles
      .map((f, i) => f.status === 'error' ? i : -1)
      .filter(i => i !== -1);

    if (failedIndexes.length === 0) return;

    // Reset all failed files to pending
    setSelectedFiles(prev => prev.map(f =>
      f.status === 'error' ? { ...f, status: 'pending', error: undefined, progress: 0 } : f
    ));

    // Start uploading from the first failed file
    setIsUploading(true);
    await uploadNextFile(failedIndexes[0]);
  };

  const uploadNextFile = async (index: number) => {
    if (index >= selectedFiles.length) {
      setIsUploading(false);
      setCurrentUploadIndex(0);

      // Check if all files uploaded successfully
      const allSuccess = selectedFiles.every(f => f.status === 'completed');
      if (allSuccess) {
        setTimeout(() => {
          setSelectedFiles([]);
          onOpenChange(false);
        }, 1500); // Give time to see the success state
      }
      return;
    }

    const fileStatus = selectedFiles[index];
    if (fileStatus.status !== 'pending') {
      // Skip already processed files
      await uploadNextFile(index + 1);
      return;
    }

    setCurrentUploadIndex(index);

    // Update status to uploading
    setSelectedFiles(prev => prev.map((f, i) =>
      i === index ? { ...f, status: 'uploading' } : f
    ));

    try {
      await uploadMutation.mutateAsync({
        projectId,
        file: fileStatus.file,
        onProgress: (progress) => {
          setSelectedFiles(prev => prev.map((f, i) =>
            i === index ? { ...f, progress } : f
          ));
        },
      });

      // Mark as completed
      setSelectedFiles(prev => prev.map((f, i) =>
        i === index ? { ...f, status: 'completed', progress: 100 } : f
      ));

      // Upload next file
      await uploadNextFile(index + 1);
    } catch (error: any) {
      console.error(`Upload failed for file ${index}:`, error);

      // Get detailed error message
      let errorMessage = 'Upload failed';
      if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      // Mark as error with detailed message
      setSelectedFiles(prev => prev.map((f, i) =>
        i === index ? {
          ...f,
          status: 'error',
          error: errorMessage
        } : f
      ));

      // Continue with next file even if this one failed
      await uploadNextFile(index + 1);
    }
  };

  const handleUploadAll = async () => {
    if (selectedFiles.length === 0) return;
    setIsUploading(true);
    await uploadNextFile(0);
  };

  const handleClose = () => {
    if (!isUploading) {
      setSelectedFiles([]);
      setCurrentUploadIndex(0);
      onOpenChange(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const totalFiles = selectedFiles.length;
  const completedFiles = selectedFiles.filter(f => f.status === 'completed').length;
  const errorFiles = selectedFiles.filter(f => f.status === 'error').length;
  const pendingFiles = selectedFiles.filter(f => f.status === 'pending').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Videos</DialogTitle>
          <DialogDescription>
            {totalFiles > 0
              ? `${totalFiles} file${totalFiles > 1 ? 's' : ''} selected${isUploading ? ` - Uploading ${currentUploadIndex + 1} of ${totalFiles}` : ''}`
              : "Select or drag video files to upload"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {selectedFiles.length === 0 ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? "border-gray-900 bg-gray-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-sm text-gray-600 mb-2">
                Drag and drop video files here, or click to browse
              </p>
              <p className="text-xs text-gray-500 mb-4">
                You can select multiple files at once
              </p>
              <input
                type="file"
                accept="video/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="video-upload-input"
                disabled={isUploading}
              />
              <Button
                variant="outline"
                disabled={isUploading}
                onClick={() => document.getElementById('video-upload-input')?.click()}
              >
                Select Videos
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* File list */}
              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                {selectedFiles.map((fileStatus, index) => (
                  <div
                    key={`${fileStatus.file.name}-${index}`}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      fileStatus.status === 'error' ? 'border-red-200 bg-red-50' :
                      fileStatus.status === 'completed' ? 'border-green-200 bg-green-50' :
                      fileStatus.status === 'uploading' ? 'border-blue-200 bg-blue-50' :
                      'border-gray-200 bg-white'
                    }`}
                  >
                    <FileVideo className={`h-5 w-5 flex-shrink-0 ${
                      fileStatus.status === 'error' ? 'text-red-600' :
                      fileStatus.status === 'completed' ? 'text-green-600' :
                      fileStatus.status === 'uploading' ? 'text-blue-600' :
                      'text-gray-400'
                    }`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {fileStatus.file.name}
                        </p>
                        {fileStatus.status === 'completed' && (
                          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                        )}
                        {fileStatus.status === 'error' && (
                          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                        )}
                        {fileStatus.status === 'uploading' && (
                          <Loader2 className="h-4 w-4 text-blue-600 animate-spin flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(fileStatus.file.size)}
                        {fileStatus.error && (
                          <span className="text-red-600 ml-2">{fileStatus.error}</span>
                        )}
                      </p>
                      {fileStatus.status === 'uploading' && (
                        <Progress value={fileStatus.progress} className="mt-2 h-1" />
                      )}
                    </div>

                    {fileStatus.status !== 'uploading' && (
                      <div className="flex items-center gap-1">
                        {fileStatus.status === 'error' && !isUploading && (
                          <button
                            onClick={() => retryFile(index)}
                            className="p-1 hover:bg-gray-100 rounded"
                            title="Retry upload"
                          >
                            <RotateCw className="h-4 w-4 text-orange-500" />
                          </button>
                        )}
                        <button
                          onClick={() => removeFile(index)}
                          className="p-1 hover:bg-gray-100 rounded"
                          disabled={isUploading && fileStatus.status === 'pending'}
                          title="Remove file"
                        >
                          <X className="h-4 w-4 text-gray-400" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Add more files area */}
              {!isUploading && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                    isDragging
                      ? "border-gray-900 bg-gray-50"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <p className="text-xs text-gray-500 mb-2">
                    Drag more files here or
                  </p>
                  <input
                    type="file"
                    accept="video/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    id="video-upload-input-add"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('video-upload-input-add')?.click()}
                  >
                    Add More Files
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">
              {totalFiles > 0 && (
                <>
                  {completedFiles > 0 && (
                    <span className="text-green-600">{completedFiles} completed</span>
                  )}
                  {errorFiles > 0 && (
                    <span className="text-red-600 ml-2">{errorFiles} failed</span>
                  )}
                  {pendingFiles > 0 && !isUploading && (
                    <span className="ml-2">{pendingFiles} ready</span>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isUploading}
              >
                {isUploading ? "Close After Upload" : "Cancel"}
              </Button>
              {selectedFiles.length > 0 && !isUploading && pendingFiles > 0 && (
                <Button onClick={handleUploadAll}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload {pendingFiles === totalFiles ? 'All' : `${pendingFiles} File${pendingFiles > 1 ? 's' : ''}`}
                </Button>
              )}
              {errorFiles > 0 && !isUploading && (
                <Button onClick={retryAllFailed} variant="outline" className="text-orange-600 border-orange-600 hover:bg-orange-50">
                  <RotateCw className="h-4 w-4 mr-2" />
                  Retry {errorFiles} Failed
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}