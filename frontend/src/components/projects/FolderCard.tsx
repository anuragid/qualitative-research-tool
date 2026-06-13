import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getFolderColor } from "../../lib/noise";
import { Button } from "../ui/button";
import type { Project, VideoStub } from "../../types";
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Archive,
  ArchiveRestore,
  Play,
} from "lucide-react";
import { FolderStatusIcon } from "./FolderStatusIcon";
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

const THUMBNAIL_GRADIENTS = [
  ["#667eea", "#764ba2"],
  ["#f093fb", "#f5576c"],
  ["#4facfe", "#00f2fe"],
  ["#a8edea", "#fed6e3"],
  ["#fbc2eb", "#a6c1ee"],
];

function getRecentVideos(videos: VideoStub[] | undefined): VideoStub[] {
  if (!videos || videos.length === 0) return [];
  return [...videos]
    .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
    .slice(0, 3);
}

/**
 * Front panel SVG path — the folder notch shape.
 * viewBox: 0 0 220 142. Used directly in an <svg> element (not clip-path).
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
  const thumbCount = recentVideos.length;

  const handleCardClick = (e: React.MouseEvent) => {
    if (e.target instanceof Element && e.target.closest("[data-dropdown-menu]")) return;
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
        className="group/folder relative cursor-pointer outline-none w-full mx-auto"
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
        {/* Hover outline — fades in on hover, contains everything visually */}
        <div
          className="relative transition-[border-color] ease-[var(--ease)] border-transparent
            group-hover/folder:border-[var(--folder-hover-outline-color)]
            group-active/folder:scale-[0.98] transition-transform"
          style={{
            borderRadius: "var(--folder-hover-outline-radius)",
            borderWidth: "var(--folder-hover-outline-width)",
            borderStyle: "solid",
            padding: "var(--folder-hover-outline-padding)",
          }}
        >
          {/* Dropdown menu — top-right of hover outline, appears on hover */}
          <div
            data-dropdown-menu
            onClick={(e) => e.stopPropagation()}
            className="absolute top-[var(--space-tight)] right-[var(--space-tight)] z-[10]
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
          {/*
            Folder wrapper — padding-top gives thumbnails room to fan into on hover.
            perspective on this element for 3D tilt.
          */}
          <div
            style={{
              paddingTop: "var(--folder-thumb-escape)",
              perspective: "var(--folder-perspective)",
            }}
          >
            {/* Folder body — back panel + thumbnails + front panel */}
            <div className="folder-body relative" style={{ transformStyle: "preserve-3d" }}>

              {/* Back panel — simple rounded rectangle, saturated brand color */}
              <div
                className="relative w-full rounded-[var(--radius-card)] noise-texture noise-medium"
                style={{
                  backgroundColor: color.tab,
                  aspectRatio: "var(--folder-aspect-ratio)",
                }}
              >
                {/* Inner border for dimension */}
                <div
                  className="absolute inset-0 rounded-[inherit] pointer-events-none"
                  style={{ border: "var(--folder-inner-border)" }}
                />
                <span className="relative z-[var(--z-content)]" />
              </div>

              {/* Thumbnails — positioned absolutely between back and front panels */}
              {thumbCount > 0 && (
                <div
                  className="absolute z-[2] pointer-events-none"
                  style={{ top: "calc(-1 * var(--folder-thumb-escape))", left: 0, right: 0, bottom: 0 }}
                >
                  {recentVideos.map((video, i) => {
                    const gradient = THUMBNAIL_GRADIENTS[i % THUMBNAIL_GRADIENTS.length];
                    return (
                      <div
                        key={video.id}
                        className={`folder-thumb folder-thumb-${thumbCount}-${i} absolute overflow-hidden`}
                        style={{
                          background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
                          width: "var(--folder-thumb-width)",
                          aspectRatio: "var(--folder-thumb-aspect-ratio)",
                          borderRadius: "var(--radius-md)",
                          boxShadow: "var(--folder-thumb-shadow)",
                          zIndex: 2 + (thumbCount - i),
                        }}
                      >
                        <div className="absolute inset-0 flex items-center justify-center">
                          {/* eslint-disable-next-line design-system/no-raw-tailwind-colors -- white play icon on colored thumbnail */}
                          <Play className="w-[18px] h-[18px] fill-white/80 text-white/80 drop-shadow-sm" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Front panel — SVG folder notch shape, pastel brand color */}
              <div
                className="folder-front-panel absolute inset-x-0 bottom-0 z-[5]
                  origin-bottom motion-reduce:!transition-none"
                style={{
                  height: "var(--folder-front-height)",
                  transition: `transform var(--duration-folder) var(--ease)`,
                }}
              >
                <svg
                  viewBox="0 0 220 142"
                  className="w-full h-full block"
                  preserveAspectRatio="none"
                  style={{ filter: "var(--folder-front-shadow)" }}
                >
                  <path d={FOLDER_NOTCH_PATH} fill={color.body} />
                </svg>

                {/* Noise texture overlay — clipped by the SVG via absolute positioning */}
                <div
                  className="absolute inset-0 noise-texture noise-light pointer-events-none overflow-hidden"
                  style={{
                    clipPath: `url(#folder-noise-clip-${project.id})`,
                  }}
                >
                  <span className="relative z-[var(--z-content)]" />
                </div>

                {/* Inline clip path for noise — matches the folder notch shape */}
                <svg width="0" height="0" className="absolute">
                  <defs>
                    <clipPath id={`folder-noise-clip-${project.id}`} clipPathUnits="objectBoundingBox">
                      <path d="M0.0545 0.169 C0.0227 0.169 0 0.204 0 0.2535 L0 0.9014 C0 0.9577 0.0227 1 0.0545 1 L0.9455 1 C0.9773 1 1 0.9577 1 0.9014 L1 0.2535 C1 0.204 0.9773 0.169 0.9455 0.169 L0.4318 0.169 C0.4045 0.169 0.3864 0.1408 0.3727 0.0986 L0.3455 0.0352 C0.3318 0.007 0.3136 0 0.2864 0 L0.0545 0 C0.0227 0 0 0.0352 0 0.0845 L0 0.2535" />
                    </clipPath>
                  </defs>
                </svg>

                {/* Bottom-left status icon — driven by FolderStatusIcon component */}
                <FolderStatusIcon
                  status={project.status}
                  videoCount={videoCount}
                  videos={project.videos}
                />

              </div>

            </div>
          </div>

          {/* Folder meta below */}
          <div className="mt-[var(--space-element-gap)] text-center px-[var(--space-tight)]">
            <h3 className="text-h4 truncate">{project.name}</h3>
            <p className="text-label text-text-tertiary mt-0.5">
              {videoCount === 0 ? "No files" : `${videoCount} file${videoCount !== 1 ? "s" : ""}`}
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
