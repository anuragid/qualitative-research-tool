import { useState, useCallback, useEffect, useMemo } from "react";
import { Upload, X, FileVideo, FileAudio, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatFileSize } from "../../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useUploadContext } from "../../contexts/UploadContext";
import { useProject } from "../../hooks/useProjects";
import { usePostHog } from "@posthog/react";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB (must match backend MAX_FILE_SIZE_MB)

interface VideoUploadDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFiles?: File[];
}

const MEDIA_EXTENSIONS = new Set([
  ".mp4", ".mov", ".webm", ".avi", ".mkv",
  ".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac",
]);

function isMediaFile(file: File): boolean {
  if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
    return true;
  }
  // Fallback to extension check when browser doesn't provide MIME type
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return MEDIA_EXTENSIONS.has(ext);
}

function filterAndNotify(files: File[]): File[] {
  const mediaFiles = files.filter(isMediaFile);
  const skippedCount = files.length - mediaFiles.length;
  if (skippedCount > 0) {
    toast.warning(
      `Only video and audio files are supported. ${skippedCount} file${skippedCount > 1 ? "s were" : " was"} skipped.`
    );
  }
  return mediaFiles;
}

export default function VideoUploadDialog({
  projectId,
  open,
  onOpenChange,
  initialFiles = [],
}: VideoUploadDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const { addUploads } = useUploadContext();
  const { data: project } = useProject(projectId);
  const posthog = usePostHog();

  // Process initial files when dialog opens
  // Use initialFiles.length as a dependency proxy to avoid re-running when the
  // parent passes a new empty array reference on every render.
  const initialFilesCount = initialFiles.length;
  useEffect(() => {
    if (initialFilesCount > 0 && open) {
      const videoFiles = filterAndNotify(initialFiles);
      if (videoFiles.length > 0) {
        setSelectedFiles(videoFiles);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialFiles identity changes every render; use count as proxy
  }, [open, initialFilesCount]);

  // Check for oversized files
  const oversizedFiles = useMemo(
    () => selectedFiles.filter((file) => file.size > MAX_FILE_SIZE),
    [selectedFiles]
  );
  const hasOversizedFiles = oversizedFiles.length > 0;

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
    const videoFiles = filterAndNotify(files);

    if (videoFiles.length > 0) {
      setSelectedFiles(prev => {
        const existingNames = new Set(prev.map(f => `${f.name}-${f.size}`));
        const newFiles = videoFiles.filter(f => !existingNames.has(`${f.name}-${f.size}`));
        if (newFiles.length < videoFiles.length) {
          toast.info("Duplicate files were skipped.");
        }
        return [...prev, ...newFiles];
      });
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      const videoFiles = filterAndNotify(files);

      if (videoFiles.length > 0) {
        setSelectedFiles(prev => {
          const existingNames = new Set(prev.map(f => `${f.name}-${f.size}`));
          const newFiles = videoFiles.filter(f => !existingNames.has(`${f.name}-${f.size}`));
          if (newFiles.length < videoFiles.length) {
            toast.info("Duplicate files were skipped.");
          }
          return [...prev, ...newFiles];
        });
      }

      // Reset the input value so the same files can be re-selected
      e.target.value = "";
    },
    []
  );

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadAll = () => {
    if (selectedFiles.length === 0 || !project || hasOversizedFiles) return;

    posthog?.capture("media_upload_started", {
      project_id: projectId,
      file_count: selectedFiles.length,
      total_size_bytes: selectedFiles.reduce((sum, f) => sum + f.size, 0),
    });

    // Add files to global upload queue
    addUploads(projectId, project.name, selectedFiles);

    // Close dialog and reset
    setSelectedFiles([]);
    onOpenChange(false);
  };

  const handleClose = () => {
    setSelectedFiles([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select Files to Upload</DialogTitle>
          <DialogDescription>
            Choose video or audio files to upload (max 500 MB each). They'll continue uploading in the background.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {selectedFiles.length === 0 ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-[color,background,border-color] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                isDragging
                  ? "border-interactive-focus bg-interactive-focus-bg"
                  : "border-border hover:bg-interactive-fill"
              }`}
            >
              <Upload className="mx-auto h-12 w-12 text-text-tertiary mb-4" />
              <p className="text-sm text-text-tertiary mb-2">
                Drag and drop video or audio files here, or click to browse
              </p>
              <p className="text-xs text-text-tertiary mb-4">
                You can select multiple files at once
              </p>
              <input
                type="file"
                accept="video/*,audio/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="video-upload-input"
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById('video-upload-input')?.click()}
              >
                Select Files
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* File list */}
              <div className="max-h-72 overflow-y-auto space-y-2 pr-2">
                {selectedFiles.map((file, index) => {
                  const isOversized = file.size > MAX_FILE_SIZE;
                  const isAudio = file.type.startsWith("audio/");
                  const FileIcon = isAudio ? FileAudio : FileVideo;
                  return (
                    <div
                      key={`${file.name}-${index}`}
                      className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${
                        isOversized ? "border-destructive/50" : "border-border"
                      }`}
                    >
                      <FileIcon className={`h-5 w-5 flex-shrink-0 ${isOversized ? "text-destructive" : "text-text-tertiary"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {file.name}
                        </p>
                        <p className={`text-xs ${isOversized ? "text-destructive" : "text-text-tertiary"}`}>
                          {formatFileSize(file.size)}
                        </p>
                        {isOversized && (
                          <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                            <AlertTriangle className="h-3 w-3" />
                            File exceeds 500 MB limit
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeFile(index)}
                        className="p-1 hover:bg-interactive-fill rounded-md transition-[background] duration-[var(--duration-micro)] ease-[var(--ease)]"
                        title="Remove file"
                      >
                        <X className="h-4 w-4 text-text-tertiary" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add more files area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-4 text-center transition-[color,background,border-color] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                  isDragging
                    ? "border-interactive-focus bg-interactive-focus-bg"
                    : "border-border hover:bg-interactive-fill"
                }`}
              >
                <p className="text-xs text-text-tertiary mb-2">
                  Drag more files here or
                </p>
                <input
                  type="file"
                  accept="video/*,audio/*"
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
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            {selectedFiles.length > 0 && (
              <Button onClick={handleUploadAll} disabled={hasOversizedFiles}>
                <Upload className="h-4 w-4 mr-2" />
                Start Upload ({selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''})
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
