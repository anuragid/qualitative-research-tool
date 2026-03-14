import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
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
  Eye,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/DropdownMenu";

interface VideoCardProps {
  video: Video;
}

export default function VideoCard({ video }: VideoCardProps) {
  const navigate = useNavigate();
  const deleteVideo = useDeleteVideo();
  const startAnalysis = useStartVideoAnalysis();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleRetryAnalysis = (e: React.MouseEvent) => {
    e.stopPropagation();
    startAnalysis.mutate(video.id);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate when clicking the dropdown menu
    if ((e.target as HTMLElement).closest("[data-dropdown-menu]")) return;
    navigate(`/videos/${video.id}`);
  };

  const getStatusBadge = (status: Video["status"]) => {
    switch (status) {
      case "uploaded":
        return <Badge variant="secondary" className="bg-brand-pale-blue/50 text-base-62 border-0">Uploaded</Badge>;
      case "transcribing":
        return (
          <Badge variant="default" className="bg-brand-mustard/15 text-brand-mustard border-0">
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
            Transcribing
          </Badge>
        );
      case "transcribed":
        return <Badge variant="secondary" className="bg-brand-pale-green/50 text-brand-forest border-0">Transcribed</Badge>;
      case "analyzing":
        return (
          <Badge variant="default" className="bg-brand-mustard/15 text-brand-mustard border-0">
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
            Analyzing
          </Badge>
        );
      case "analyzed":
        return (
          <Badge variant="success" className="bg-brand-forest/15 text-brand-forest border-0">
            <CheckCircle className="h-3 w-3 mr-1" />
            Analyzed
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="bg-destructive/10 text-destructive border-0">
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
      toast.error("Failed to delete video. Please try again.");
    }
  };

  return (
    <>
      <Card
        className="group bg-card rounded-2xl border-0 cursor-pointer active:scale-[0.98]"
        onClick={handleCardClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/videos/${video.id}`);
          }
        }}
        style={{
          transition: `transform var(--duration-normal) var(--ease), box-shadow var(--duration-normal) var(--ease)`,
          transform: isHovered ? "translateY(-1px)" : "translateY(0)",
          boxShadow: isHovered ? "var(--shadow-subtle)" : "none",
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <FileVideo className="h-10 w-10 text-base-40 flex-shrink-0 mt-1" />
              <div className="flex-1 min-w-0">
                <CardTitle className="text-lg truncate text-base-85">
                  {video.filename}
                </CardTitle>
                <CardDescription className="mt-1 text-base-40">
                  Uploaded {formatDate(video.uploaded_at)}
                </CardDescription>
              </div>
            </div>
            {/* Menu -- always visible on mobile, hover-reveal on desktop */}
            <div
              data-dropdown-menu
              onClick={(e) => e.stopPropagation()}
              className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-[var(--duration-micro)]"
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full h-9 w-9"
                    disabled={deleteVideo.isPending}
                  >
                    <MoreVertical className="h-4 w-4 text-base-40" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(`/videos/${video.id}`)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pb-3">
          <div className="flex items-center gap-4 text-sm text-base-55">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{video.duration_seconds ? formatDuration(video.duration_seconds) : "Unknown"}</span>
            </div>
            <div>{formatFileSize(video.file_size_bytes)}</div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-2 pt-0">
          <div className="flex items-center justify-between w-full">
            {getStatusBadge(video.status)}
            {video.error_message && (
              <p className="text-xs text-destructive truncate flex-1 ml-2">
                {video.error_message}
              </p>
            )}
          </div>
          {/* Retry button for failed analysis */}
          {video.status === "error" && (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 rounded-full"
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
              variant="ghost"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleteVideo.isPending}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteVideo.isPending}
              className="rounded-full"
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
