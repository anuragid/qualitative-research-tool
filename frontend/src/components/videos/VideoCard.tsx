import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatFileSize, formatDuration, formatDate } from "../../lib/utils";
import {
  FileVideo,
  Clock,
  Trash2,
  MoreVertical,
  AlertCircle,
  Loader2,
  CheckCircle,
  RefreshCw,
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
import { useStartVideoAnalysis } from "../../hooks/useAnalysis";
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
  const startAnalysis = useStartVideoAnalysis();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleRetryAnalysis = (e: React.MouseEvent) => {
    e.stopPropagation();
    startAnalysis.mutate(video.id);
  };

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
      case "analyzed":
        return (
          <Badge variant="success">
            <CheckCircle className="h-3 w-3 mr-1" />
            Analyzed
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

  const handleDelete = async () => {
    try {
      await deleteVideo.mutateAsync(video.id);
      setShowDeleteDialog(false);
    } catch {
      // Error is handled by the mutation's error state
    }
  };

  return (
    <>
      <Card
        className="group hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => navigate(`/videos/${video.id}`)}
      >
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <FileVideo className="h-10 w-10 text-muted-foreground flex-shrink-0 mt-1" />
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
              className="h-9 w-9 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150"
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
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{video.duration_seconds ? formatDuration(video.duration_seconds) : "Unknown"}</span>
            </div>
            <div>{formatFileSize(video.file_size_bytes)}</div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          <div className="flex items-center justify-between w-full">
            {getStatusBadge(video.status)}
            {video.error_message && (
              <p className="text-xs text-destructive truncate flex-1 ml-2">
                {video.error_message}
              </p>
            )}
          </div>
          {/* Retry button for failed analysis - Nielsen #9: Help users recover from errors */}
          {video.status === "error" && (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={handleRetryAnalysis}
              disabled={startAnalysis.isPending}
            >
              {startAnalysis.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry Analysis
                </>
              )}
            </Button>
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
