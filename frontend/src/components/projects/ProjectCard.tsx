import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatDate } from "../../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import type { Project, ProjectStatus } from "../../types";
import { Video, Calendar, MoreVertical, Edit, Trash2, Archive, ArchiveRestore, AlertCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/DropdownMenu";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import { EditProjectDialog } from "./EditProjectDialog";
import { useUpdateProject } from "../../hooks/useProjects";

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const navigate = useNavigate();
  const { mutate: updateProject } = useUpdateProject();
  const videoCount = project.videos?.length || 0;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Helper function to get badge variant based on status
  const getStatusBadgeVariant = (status: ProjectStatus) => {
    switch (status) {
      case "planning":
        return "secondary";  // Gray
      case "ready":
        return "default";    // Green
      case "processing":
        return "default";    // Blue (we'll add custom class)
      case "completed":
        return "default";    // Purple (we'll add custom class)
      case "archived":
        return "outline";    // Muted/outline
      case "error":
        return "destructive"; // Red
      default:
        return "secondary";
    }
  };

  // Helper function to get badge class for custom colors
  const getStatusBadgeClass = (status: ProjectStatus) => {
    switch (status) {
      case "processing":
        return "bg-blue-500 hover:bg-blue-600 text-white";
      case "completed":
        return "bg-purple-500 hover:bg-purple-600 text-white";
      case "error":
        return "bg-red-500 hover:bg-red-600 text-white";
      default:
        return "";
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Prevent navigation if clicking on the dropdown menu
    if ((e.target as HTMLElement).closest('[data-dropdown-menu]')) {
      e.preventDefault();
      return;
    }
    navigate(`/projects/${project.id}`);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowEditDialog(true);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const handleArchiveClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    updateProject(
      {
        id: project.id,
        data: { status: "archived" },
      },
      {
        onError: (error) => {
          console.error("Error archiving project:", error);
        },
      }
    );
  };

  const handleUnarchiveClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // When unarchiving, set status to "ready" if has videos, otherwise "planning"
    const newStatus = videoCount > 0 ? "ready" : "planning";
    updateProject(
      {
        id: project.id,
        data: { status: newStatus },
      },
      {
        onError: (error) => {
          console.error("Error unarchiving project:", error);
        },
      }
    );
  };

  return (
    <>
      <Card
        className="transition-all hover:shadow-lg cursor-pointer"
        onClick={handleCardClick}
      >
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg">{project.name}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge
                variant={getStatusBadgeVariant(project.status)}
                className={getStatusBadgeClass(project.status)}
              >
                {project.status === "error" && (
                  <AlertCircle className="h-3 w-3 mr-1" />
                )}
                {project.status}
              </Badge>
              <div data-dropdown-menu onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-gray-100"
                    >
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleEditClick}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    {project.status === "archived" ? (
                      <DropdownMenuItem onClick={handleUnarchiveClick}>
                        <ArchiveRestore className="mr-2 h-4 w-4" />
                        Unarchive
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={handleArchiveClick}>
                        <Archive className="mr-2 h-4 w-4" />
                        Archive
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleDeleteClick}
                      className="text-red-600 focus:text-red-600 focus:bg-red-50"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4 line-clamp-2">
            {project.description || "No description"}
          </p>

          {/* Show error message if project is in error state */}
          {project.status === "error" && project.error_message && (
            <div className="bg-red-50 border border-red-200 rounded-md p-2 mb-3">
              <p className="text-xs text-red-700 flex items-start gap-1">
                <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span className="line-clamp-2">{project.error_message}</span>
              </p>
            </div>
          )}

          <div className="flex items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <Video className="h-4 w-4" />
              <span>{videoCount} video{videoCount !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(project.created_at)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <DeleteProjectDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        project={{
          id: project.id,
          name: project.name,
          videoCount: videoCount,
        }}
      />

      <EditProjectDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        project={{
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
        }}
      />
    </>
  );
}
