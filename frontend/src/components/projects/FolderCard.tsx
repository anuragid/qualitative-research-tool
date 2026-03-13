import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDate } from "../../lib/utils";
import { getFolderColor } from "../../lib/noise";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import type { Project, ProjectStatus } from "../../types";
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Archive,
  ArchiveRestore,
  AlertCircle,
  Video,
  ArrowRight,
} from "lucide-react";
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

interface FolderCardProps {
  project: Project;
  colorIndex: number;
}

const STATUS_BADGE_VARIANT: Record<ProjectStatus, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  planning: "secondary",
  ready: "secondary",
  processing: "warning",
  completed: "success",
  archived: "outline",
  error: "destructive",
};

export default function FolderCard({ project, colorIndex }: FolderCardProps) {
  const navigate = useNavigate();
  const { mutate: updateProject } = useUpdateProject();
  const videoCount = project.videos?.length || 0;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const color = getFolderColor(colorIndex);

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-dropdown-menu]")) return;
    navigate(`/projects/${project.id}`);
  };

  const handleArchiveToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (project.status === "archived") {
      updateProject({ id: project.id, data: { status: videoCount > 0 ? "ready" : "planning" } });
    } else {
      updateProject({ id: project.id, data: { status: "archived" } });
    }
  };

  return (
    <>
      <div
        className="relative cursor-pointer pt-6 group"
        onClick={handleCardClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/projects/${project.id}`);
          }
        }}
        style={{
          transition: `transform var(--duration-normal) var(--ease), box-shadow var(--duration-normal) var(--ease)`,
          transform: isHovered ? "translateY(-2px)" : "translateY(0)",
        }}
      >
        {/* Folder Tab */}
        <div
          className="absolute top-0 left-4 w-20 h-7 rounded-t-md noise-texture noise-medium"
          style={{ backgroundColor: color.tab }}
        >
          <span className="relative z-[2]" />
        </div>

        {/* Folder Body */}
        <div
          className="relative rounded-2xl min-h-[160px] p-5 noise-texture noise-light flex flex-col justify-between"
          style={{
            backgroundColor: color.body,
            boxShadow: isHovered ? "var(--shadow-subtle)" : "none",
          }}
        >
          {/* Content sits above noise layer */}
          <div className="relative z-[2]">
            {/* Top row: icon + title + menu */}
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-4 h-4 rounded border border-base-25 flex-shrink-0" />
                <h3 className="text-h4 truncate">{project.name}</h3>
              </div>

              <div className="flex items-center gap-2">
                {project.status !== "planning" && (
                  <Badge variant={STATUS_BADGE_VARIANT[project.status]}>
                    {project.status === "error" && <AlertCircle className="h-3 w-3 mr-1" />}
                    {project.status}
                  </Badge>
                )}

                {/* Menu -- appears on hover */}
                <div
                  data-dropdown-menu
                  onClick={(e) => e.stopPropagation()}
                  className="transition-opacity duration-[var(--duration-micro)]"
                  style={{ opacity: isHovered ? 1 : 0 }}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShowEditDialog(true); }}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleArchiveToggle}>
                        {project.status === "archived" ? (
                          <><ArchiveRestore className="mr-2 h-4 w-4" />Unarchive</>
                        ) : (
                          <><Archive className="mr-2 h-4 w-4" />Archive</>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(true); }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            {project.description && (
              <p className="text-sm text-base-55 line-clamp-2 mb-2">{project.description}</p>
            )}

            {project.status === "error" && project.error_message && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-md p-2 mb-2">
                <p className="text-xs text-destructive flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{project.error_message}</span>
                </p>
              </div>
            )}
          </div>

          {/* Bottom row: metadata + arrow */}
          <div className="relative z-[2] flex items-center justify-between mt-auto pt-3">
            <div className="flex items-center gap-3">
              <span className="text-label uppercase text-base-55">
                {formatDate(project.created_at)}
              </span>
              {videoCount > 0 && (
                <span className="flex items-center gap-1 text-label text-base-40">
                  <Video className="h-3 w-3" />
                  {videoCount}
                </span>
              )}
            </div>
            <ArrowRight className="h-4 w-4 text-base-40" />
          </div>
        </div>
      </div>

      <DeleteProjectDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        project={{ id: project.id, name: project.name, videoCount }}
      />
      <EditProjectDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        project={{ id: project.id, name: project.name, description: project.description, status: project.status }}
      />
    </>
  );
}
