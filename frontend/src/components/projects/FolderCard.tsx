import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getFolderColor } from "../../lib/noise";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import type { Project, ProjectStatus, Video } from "../../types";
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Archive,
  ArchiveRestore,
  Plus,
  FolderOpen,
  Play,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
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

/** Deterministic gradient pairs for video thumbnail placeholders */
const THUMBNAIL_GRADIENTS = [
  ["#667eea", "#764ba2"],
  ["#f093fb", "#f5576c"],
  ["#4facfe", "#00f2fe"],
  ["#a8edea", "#fed6e3"],
  ["#fbc2eb", "#a6c1ee"],
];

/** Get up to 3 most-recent videos, sorted by uploaded_at descending */
function getRecentVideos(videos: Video[] | undefined): Video[] {
  if (!videos || videos.length === 0) return [];
  return [...videos]
    .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
    .slice(0, 3);
}

/**
 * SVG folder-notch front panel path.
 * Original viewBox coords: 0 0 220 142
 */
const FOLDER_NOTCH_PATH =
  "M12 24 C5 24,0 29,0 36 L0 128 C0 136,5 142,12 142 L208 142 C215 142,220 136,220 128 L220 36 C220 29,215 24,208 24 L95 24 C89 24,85 20,82 14 L76 5 C73 1,69 0,63 0 L12 0 C5 0,0 5,0 12 L0 36";

export default function FolderCard({ project, colorIndex }: FolderCardProps) {
  const navigate = useNavigate();
  const { mutate: updateProject } = useUpdateProject();
  const videoCount = project.videos?.length || 0;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const color = getFolderColor(colorIndex);
  const recentVideos = useMemo(() => getRecentVideos(project.videos), [project.videos]);

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

  /**
   * Returns CSS custom properties for each thumbnail that drive default + hover transforms.
   * We set --thumb-x, --thumb-y, --thumb-r for default and --thumb-hx, --thumb-hy, --thumb-hr for hover.
   * The actual transition is driven by group-hover via a CSS class in index.css.
   */
  const getThumbVars = (count: number, index: number): React.CSSProperties => {
    // Horizontal offset for fanning
    let xOffset = 0;
    if (count === 2) {
      xOffset = index === 0 ? -16 : 16;
    } else if (count >= 3) {
      xOffset = (index - 1) * 24;
    }

    // Hover fan-out rotation
    let hoverRotate = 0;
    if (count === 2) {
      hoverRotate = index === 0 ? -12 : 12;
    } else if (count >= 3) {
      hoverRotate = [-12, 0, 12][index];
    }

    return {
      "--thumb-x": `${xOffset}px`,
      "--thumb-y": "0px",
      "--thumb-r": "0deg",
      "--thumb-hx": `${xOffset}px`,
      "--thumb-hy": "-32px",
      "--thumb-hr": `${hoverRotate}deg`,
    } as React.CSSProperties;
  };

  return (
    <>
      <div
        className="group/folder relative cursor-pointer outline-none"
        onClick={handleCardClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/projects/${project.id}`);
          }
        }}
        data-animate="folder-card"
      >
        {/* Hover outline container */}
        <div
          className="rounded-[20px] p-2 transition-all duration-[var(--duration-normal)] ease-[var(--ease)]
            border-[1.5px] border-transparent
            group-hover/folder:border-[rgba(26,28,30,0.06)]
            group-active/folder:scale-[0.98]"
        >
          {/* Folder area — contains back panel, thumbnails, front panel */}
          <div className="relative" style={{ height: 160, perspective: "600px" }}>
            {/* Back panel */}
            <div
              className="absolute inset-x-0 top-0 bottom-0 rounded-[var(--radius-card)] noise-texture noise-medium"
              style={{ backgroundColor: color.tab }}
            >
              <span className="relative z-[2]" />
            </div>

            {/* Thumbnails — sit between back and front panels */}
            {recentVideos.length > 0 && (
              <div className="absolute inset-x-0 top-0 bottom-0 flex items-start justify-center z-[3] pointer-events-none">
                {recentVideos.map((video, i) => {
                  const gradient = THUMBNAIL_GRADIENTS[i % THUMBNAIL_GRADIENTS.length];
                  const vars = getThumbVars(recentVideos.length, i);

                  return (
                    <div
                      key={video.id}
                      className="folder-thumbnail absolute top-4 w-16 h-20 rounded-lg overflow-hidden shadow-sm
                        motion-reduce:!transition-none"
                      style={{
                        background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
                        zIndex: 3 + i,
                        ...vars,
                      }}
                    >
                      {/* Play icon overlay */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        {/* eslint-disable-next-line design-system/no-raw-tailwind-colors -- white on gradient thumbnail */}
                        <Play className="w-5 h-5 text-white/80 fill-white/80" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Front panel — SVG with folder notch */}
            <div
              className="absolute inset-x-0 bottom-0 z-[5] transition-transform duration-[0.4s] ease-[var(--ease)]
                origin-bottom
                group-hover/folder:[transform:rotateX(-14deg)]
                motion-reduce:group-hover/folder:transform-none"
              style={{ height: 130 }}
            >
              <svg
                viewBox="0 0 220 142"
                className="w-full h-full"
                preserveAspectRatio="none"
              >
                <path
                  d={FOLDER_NOTCH_PATH}
                  fill={color.body}
                />
              </svg>

              {/* Noise overlay on front panel */}
              <div
                className="absolute inset-0 noise-texture noise-light pointer-events-none"
                style={{ borderRadius: "inherit" }}
              >
                <span className="relative z-[2]" />
              </div>

              {/* Bottom-left icon */}
              <div className="absolute bottom-3 left-3 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(26, 28, 30, 0.08)" }}
              >
                {videoCount === 0 ? (
                  <Plus className="w-3.5 h-3.5 text-text-tertiary" />
                ) : (
                  <FolderOpen className="w-3.5 h-3.5 text-text-tertiary" />
                )}
              </div>

              {/* Status badge — on front panel */}
              {project.status !== "planning" && project.status !== "error" && (
                <div className="absolute bottom-3 right-3">
                  <Badge variant={STATUS_BADGE_VARIANT[project.status]}>
                    {project.status}
                  </Badge>
                </div>
              )}
              {project.status === "error" && (
                <div className="absolute bottom-3 right-3">
                  <Badge variant="destructive">Error</Badge>
                </div>
              )}
            </div>

            {/* Dropdown menu — appears on hover over folder area */}
            <div
              data-dropdown-menu
              onClick={(e) => e.stopPropagation()}
              className="absolute top-2 right-2 z-[10]
                opacity-100 sm:opacity-0 sm:group-hover/folder:opacity-100
                transition-opacity duration-[var(--duration-micro)]"
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {/* eslint-disable-next-line design-system/no-raw-tailwind-colors -- frosted glass on folder */}
                  <Button variant="ghost" size="icon" className="h-8 w-8 bg-white/60 hover:bg-white/80 backdrop-blur-sm rounded-full">
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

          {/* Folder meta below */}
          <div className="mt-3 text-center px-1">
            <h3 className="text-h4 truncate">{project.name}</h3>
            <p className="text-label text-text-tertiary mt-0.5">
              {videoCount === 0 ? "No videos" : `${videoCount} video${videoCount !== 1 ? "s" : ""}`}
            </p>
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
