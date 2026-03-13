import { useState, useCallback, useEffect } from "react";
import { Upload, X, FileVideo } from "lucide-react";
import { formatFileSize } from "../../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/Dialog";
import { Button } from "../ui/Button";
import { useUploadContext } from "../../contexts/UploadContext";
import { useProject } from "../../hooks/useProjects";

interface VideoUploadDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFiles?: File[];
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

  // Process initial files when dialog opens
  useEffect(() => {
    if (initialFiles.length > 0 && open) {
      const videoFiles = initialFiles.filter((file) => file.type.startsWith("video/"));
      if (videoFiles.length > 0) {
        setSelectedFiles(videoFiles);
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
      setSelectedFiles(prev => [...prev, ...videoFiles]);
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      const videoFiles = files.filter((file) => file.type.startsWith("video/"));

      if (videoFiles.length > 0) {
        setSelectedFiles(prev => [...prev, ...videoFiles]);
      }
    },
    []
  );

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadAll = () => {
    if (selectedFiles.length === 0 || !project) return;

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
          <DialogTitle>Select Videos to Upload</DialogTitle>
          <DialogDescription>
            Choose video files to upload. They'll continue uploading in the background.
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
                  ? "border-primary bg-muted"
                  : "border-border hover:border-border/80"
              }`}
            >
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-2">
                Drag and drop video files here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                You can select multiple files at once
              </p>
              <input
                type="file"
                accept="video/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="video-upload-input"
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById('video-upload-input')?.click()}
              >
                Select Videos
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* File list */}
              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                {selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
                  >
                    <FileVideo className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFile(index)}
                      className="p-1 hover:bg-accent rounded"
                      title="Remove file"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add more files area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                  isDragging
                    ? "border-primary bg-muted"
                    : "border-border hover:border-border/80"
                }`}
              >
                <p className="text-xs text-muted-foreground mb-2">
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
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            {selectedFiles.length > 0 && (
              <Button onClick={handleUploadAll}>
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