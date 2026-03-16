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
  Video as VideoIcon,
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

const THUMBNAIL_GRADIENTS = [
  ["#667eea", "#764ba2"],
  ["#f093fb", "#f5576c"],
  ["#4facfe", "#00f2fe"],
  ["#a8edea", "#fed6e3"],
  ["#fbc2eb", "#a6c1ee"],
];

function getRecentVideos(videos: Video[] | undefined): Video[] {
  if (!videos || videos.length === 0) return [];
  return [...videos]
    .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
    .slice(0, 3);
}

/**
 * Folder notch clip path using objectBoundingBox units (0-1 range).
 * Derived from viewBox 0 0 220 142 by dividing x/220, y/142.
 * This scales to any element size without distortion.
 */
const FOLDER_CLIP_PATH = `M0.0545 0.169 C0.0227 0.169 0 0.204 0 0.2535 L0 0.9014 C0 0.9577 0.0227 1 0.0545 1 L0.9455 1 C0.9773 1 1 0.9577 1 0.9014 L1 0.2535 C1 0.204 0.9773 0.169 0.9455 0.169 L0.4318 0.169 C0.4045 0.169 0.3864 0.1408 0.3727 0.0986 L0.3455 0.0352 C0.3318 0.007 0.3136 0 0.2864 0 L0.0545 0 C0.0227 0 0 0.0352 0 0.0845 L0 0.2535`;

/** Thumbnail default/hover transform config per position */
function getThumbStyle(count: number, index: number) {
  // Default: stacked near center, tucked in, barely peeking
  const defaultRotate = count === 1 ? 0 : count === 2 ? (index === 0 ? -3 : 3) : [-3, 1, 4][index];
  // Horizontal spread from center
  const spreadX = count === 1 ? 0 : count === 2 ? (index === 0 ? -18 : 18) : (index - 1) * 26;
  // Hover fan-out rotation
  const hoverRotate = count === 1 ? 0 : count === 2 ? (index === 0 ? -10 : 10) : [-12, 0, 12][index];
  // Hover rise amount
  const hoverY = count === 1 ? -28 : count === 2 ? -26 : [-24, -30, -24][index];
  // Hover horizontal spread
  const hoverX = count === 1 ? 0 : count === 2 ? (index === 0 ? -22 : 22) : (index - 1) * 32;

  return {
    "--t-x": `${spreadX}px`,
    "--t-r": `${defaultRotate}deg`,
    "--t-hx": `${hoverX}px`,
    "--t-hy": `${hoverY}px`,
    "--t-hr": `${hoverRotate}deg`,
  } as React.CSSProperties;
}

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

  return (
    <>
      {/* Hidden SVG defs for the clip path — objectBoundingBox scales to any size */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <clipPath id={`folder-clip-${project.id}`} clipPathUnits="objectBoundingBox">
            <path d={FOLDER_CLIP_PATH} />
          </clipPath>
        </defs>
      </svg>

      <div
        className="group/folder relative cursor-pointer outline-none mx-auto"
        style={{ maxWidth: "var(--folder-max-w)" }}
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
        {/* Hover outline container — everything stays inside this */}
        <div
          className="p-[var(--space-inline-gap)]
            transition-all duration-[var(--duration-normal)] ease-[var(--ease)]
            border-transparent
            group-hover/folder:border-[var(--folder-hover-outline-color)]
            group-active/folder:scale-[0.98]"
          style={{
            borderRadius: "var(--folder-hover-outline-radius)",
            borderWidth: "var(--folder-hover-outline-width)",
          }}
        >
          {/* Folder area */}
          <div className="relative overflow-hidden" style={{ aspectRatio: "var(--folder-aspect)", perspective: "800px" }}>

            {/* Back panel — simple rounded rectangle, saturated color */}
            <div
              className="absolute inset-0 rounded-[var(--radius-card)] noise-texture noise-medium"
              style={{ backgroundColor: color.tab }}
            >
              <span className="relative z-[var(--z-content)]" />
            </div>

            {/* Thumbnails — between back and front, peeking at top */}
            {recentVideos.length > 0 && (
              <div className="absolute inset-0 z-[2] pointer-events-none flex items-start justify-center">
                {recentVideos.map((video, i) => {
                  const gradient = THUMBNAIL_GRADIENTS[i % THUMBNAIL_GRADIENTS.length];
                  return (
                    <div
                      key={video.id}
                      className="folder-thumbnail absolute rounded-[var(--radius-md)] overflow-hidden
                        shadow-subtle motion-reduce:!transition-none"
                      style={{
                        background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
                        width: "var(--folder-thumb-width)",
                        aspectRatio: "var(--folder-thumb-aspect)",
                        top: "var(--folder-thumb-top)",
                        zIndex: 2 + (recentVideos.length - i),
                        ...getThumbStyle(recentVideos.length, i),
                      }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Play className="w-4 h-4 fill-white/80 text-white/80 drop-shadow-sm" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Front panel — folder notch shape via clip-path, pastel color */}
            <div
              className="folder-front-panel absolute inset-x-0 bottom-0 z-[5]
                transition-transform ease-[var(--ease)]
                origin-bottom
                motion-reduce:group-hover/folder:transform-none"
              style={{
                height: "var(--folder-front-height)",
                clipPath: `url(#folder-clip-${project.id})`,
                backgroundColor: color.body,
                transitionDuration: "var(--duration-folder)",
              }}
            >
              {/* Noise texture — clips naturally to the parent's clip-path */}
              <div className="absolute inset-0 noise-texture noise-light pointer-events-none">
                <span className="relative z-[var(--z-content)]" />
              </div>

              {/* Bottom-left status icon */}
              <div
                className="absolute bottom-[var(--space-element-gap)] left-[var(--space-element-gap)]
                  w-7 h-7 rounded-full flex items-center justify-center z-[var(--z-content)]
                  bg-interactive-fill"
              >
                {videoCount === 0 ? (
                  <Plus className="w-3.5 h-3.5 text-text-tertiary" />
                ) : (
                  <VideoIcon className="w-3.5 h-3.5 text-text-tertiary" />
                )}
              </div>

              {/* Status badge */}
              {project.status !== "planning" && project.status !== "ready" && (
                <div className="absolute bottom-[var(--space-element-gap)] right-[var(--space-element-gap)] z-[var(--z-content)]">
                  <Badge variant={STATUS_BADGE_VARIANT[project.status]}>
                    {project.status === "error" ? "Error" : project.status}
                  </Badge>
                </div>
              )}
            </div>

            {/* Dropdown menu */}
            <div
              data-dropdown-menu
              onClick={(e) => e.stopPropagation()}
              className="absolute top-[var(--space-inline-gap)] right-[var(--space-inline-gap)] z-[10]
                opacity-100 sm:opacity-0 sm:group-hover/folder:opacity-100
                transition-opacity duration-[var(--duration-micro)]"
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 frosted-glass rounded-full"
                  >
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
          <div className="mt-[var(--space-element-gap)] text-center px-[var(--space-tight)]">
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
