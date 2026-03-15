import { useRef } from "react";
import { useProjects } from "../hooks/useProjects";
import Layout from "../components/Layout";
import FolderCard from "../components/projects/FolderCard";
import CreateProjectDialog from "../components/projects/CreateProjectDialog";
import { Skeleton } from "../components/ui/Skeleton";
import { Button } from "../components/ui/Button";
import { gsap, useGSAP, animations, prefersReducedMotion } from "../lib/animations";
import { RefreshCw } from "lucide-react";

export default function ProjectsPage() {
  const { data: projects, isLoading, error, refetch } = useProjects();
  const gridRef = useRef<HTMLDivElement>(null);

  // GSAP staggered entrance animation for folder cards
  useGSAP(
    () => {
      if (prefersReducedMotion() || !projects || projects.length === 0) return;

      gsap.fromTo("[data-animate='folder-card']",
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: animations.fadeInUp.duration, ease: animations.fadeInUp.ease, stagger: animations.stagger }
      );
    },
    { scope: gridRef, dependencies: [projects] }
  );

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-h2">Projects</h1>
            <p className="text-base-55 mt-1">
              Manage your research projects and interview videos
            </p>
          </div>
          <CreateProjectDialog />
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="pt-6">
                {/* Skeleton tab */}
                <Skeleton className="w-20 h-7 rounded-t-md mb-0" />
                {/* Skeleton body */}
                <Skeleton className="h-40 rounded-2xl" />
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-5">
            <p className="text-destructive">
              Failed to load projects. Please try again.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        )}

        {/* Empty State */}
        {projects && projects.length === 0 && (
          <div className="text-center py-16">
            <h2 className="text-h3 mb-3">
              Welcome to methodex
            </h2>
            <p className="text-base-55 text-body max-w-md mx-auto mb-6">
              Create your first project to start organizing your qualitative
              research interviews and discovering insights.
            </p>
            <CreateProjectDialog />
          </div>
        )}

        {/* Projects Grid */}
        {projects && projects.length > 0 && (
          <div
            ref={gridRef}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {projects.map((project, index) => (
              <div key={project.id} data-animate="folder-card">
                <FolderCard project={project} colorIndex={index} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
