import { useRef } from "react";
import { useProjects } from "../hooks/useProjects";
import Layout from "../components/Layout";
import FolderCard from "../components/projects/FolderCard";
import CreateProjectDialog from "../components/projects/CreateProjectDialog";
import { Skeleton } from "../components/ui/skeleton";
import { Button } from "../components/ui/button";
import { PageHeader } from "../components/ui/page-header";
import { AlertBanner } from "../components/ui/alert-banner";
import { EmptyState } from "../components/ui/empty-state";
import { gsap, useGSAP, animations, prefersReducedMotion } from "../lib/animations";
import { FolderOpen, RefreshCw } from "lucide-react";

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
        <PageHeader
          title="Projects"
          description="Manage your research projects and interview videos"
          actions={<CreateProjectDialog />}
        />

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="p-2">
                {/* Skeleton folder */}
                <Skeleton className="h-40 rounded-[var(--radius-card)]" />
                {/* Skeleton meta */}
                <div className="mt-3 flex flex-col items-center gap-1">
                  <Skeleton className="h-5 w-24 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {error && (
          <AlertBanner
            variant="error"
            action={
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => refetch()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            }
          >
            Failed to load projects. Please try again.
          </AlertBanner>
        )}

        {/* Empty State */}
        {projects && projects.length === 0 && (
          <EmptyState
            icon={FolderOpen}
            heading="Welcome to methodex"
            description="Create your first project to start organizing your qualitative research interviews and discovering insights."
            action={<CreateProjectDialog />}
            className="py-16"
          />
        )}

        {/* Projects Grid */}
        {projects && projects.length > 0 && (
          <div
            ref={gridRef}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {projects.map((project, index) => (
              <FolderCard key={project.id} project={project} colorIndex={index} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
