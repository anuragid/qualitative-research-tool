import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileVideo,
  Clock,
  Trash2,
  MoreVertical,
  AlertCircle,
  Loader2,
  CheckCircle,
} from "lucide-react";
import type { Video } from "../../types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { useDeleteVideo } from "../../hooks/useVideos";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/Dialog";

interface VideoCardProps {
  video: Video;
}

export default function VideoCard({ video }: VideoCardProps) {
  const navigate = useNavigate();
  const deleteVideo = useDeleteVideo();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const getStatusBadge = (status: Video["status"]) => {
    switch (status) {
      case "uploaded":
        return <Badge variant="secondary">Uploaded</Badge>;
      case "transcribing":
        return (
          <Badge variant="default">
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
            Transcribing
          </Badge>
        );
      case "transcribed":
        return <Badge variant="secondary">Transcribed</Badge>;
      case "analyzing":
        return (
          <Badge variant="default">
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
            Analyzing
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="success">
            <CheckCircle className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "Unknown";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const handleDelete = async () => {
    try {
      await deleteVideo.mutateAsync(video.id);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Failed to delete video:", error);
    }
  };

  return (
    <>
      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => navigate(`/videos/${video.id}`)}
      >
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <FileVideo className="h-10 w-10 text-gray-600 flex-shrink-0 mt-1" />
              <div className="flex-1 min-w-0">
                <CardTitle className="text-lg truncate">
                  {video.filename}
                </CardTitle>
                <CardDescription className="mt-1">
                  Uploaded {formatDate(video.uploaded_at)}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteDialog(true);
              }}
              disabled={deleteVideo.isPending}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{formatDuration(video.duration_seconds)}</span>
            </div>
            <div>{formatFileSize(video.file_size_bytes)}</div>
          </div>
        </CardContent>

        <CardFooter className="flex items-center justify-between">
          {getStatusBadge(video.status)}
          {video.error_message && (
            <p className="text-xs text-red-600 truncate flex-1 ml-2">
              {video.error_message}
            </p>
          )}
        </CardFooter>
      </Card>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Video</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{video.filename}"? This action
              cannot be undone and will remove all associated transcripts and
              analysis.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleteVideo.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteVideo.isPending}
            >
              {deleteVideo.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
