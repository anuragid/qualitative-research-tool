import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatFileSize, formatDuration, formatDate, formatFilename } from "../../lib/utils";
import {
  FileVideo,
  FileAudio,
  Clock,
  Trash2,
  MoreVertical,
  Loader2,
  RefreshCw,
  Eye,
} from "lucide-react";
import type { Video } from "../../types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "../ui/card";
import { Button } from "../ui/button";
import { StatusBadge } from "../ui/status-badge";
import type { VideoStatus } from "../ui/status-badge";
import { MetadataRow } from "../ui/metadata-row";
import { useDeleteVideo } from "../../hooks/useVideos";
import { useStartVideoAnalysis } from "../../hooks/useAnalysis";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface VideoCardProps {
  video: Video;
}

export default function VideoCard({ video }: VideoCardProps) {
  const navigate = useNavigate();
  const deleteVideo = useDeleteVideo();
  const startAnalysis = useStartVideoAnalysis();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const isAudio = video.filename.match(/\.(mp3|wav|m4a|ogg|flac|aac)$/i);
  const FileIcon = isAudio ? FileAudio : FileVideo;

  const handleRetryAnalysis = (e: React.MouseEvent) => {
    e.stopPropagation();
    startAnalysis.mutate(video.id);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate when clicking the dropdown menu
    if (e.target instanceof Element && e.target.closest("[data-dropdown-menu]")) return;
    navigate(`/videos/${video.id}`);
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
        className="group bg-card rounded-2xl border-0 cursor-pointer active:scale-[0.98] transition-[transform,box-shadow] duration-[var(--duration-normal)] ease-[var(--ease)] hover:-translate-y-px hover:shadow-subtle"
        onClick={handleCardClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/videos/${video.id}`);
          }
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <FileIcon className="h-10 w-10 text-text-placeholder flex-shrink-0 mt-1" />
              <div className="flex-1 min-w-0">
                <CardTitle className="text-lg truncate text-text-primary" title={video.filename}>
                  {formatFilename(video.filename)}
                </CardTitle>
                <CardDescription className="mt-1 text-text-placeholder">
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
                    <MoreVertical className="h-4 w-4 text-text-placeholder" />
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

        <div className="px-6 pb-3">
          <MetadataRow
            items={[
              { value: video.duration_seconds ? formatDuration(video.duration_seconds) : "Unknown", icon: Clock },
              { value: formatFileSize(video.file_size_bytes) },
            ]}
          />
        </div>

        <CardFooter className="flex flex-col gap-2 pt-0">
          <div className="flex items-center justify-between w-full">
            <StatusBadge status={video.status as VideoStatus} />
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
            <DialogTitle>Delete File</DialogTitle>
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
