import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatDate } from "../../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import type { Project } from "../../types";
import { Video, Calendar, MoreVertical, Edit, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/DropdownMenu";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import { EditProjectDialog } from "./EditProjectDialog";

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const navigate = useNavigate();
  const videoCount = project.videos?.length || 0;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

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
              <Badge variant={project.status === "active" ? "default" : "secondary"}>
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
