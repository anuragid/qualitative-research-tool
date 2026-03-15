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
