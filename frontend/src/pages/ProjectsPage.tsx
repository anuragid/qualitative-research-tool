import { useProjects } from "../hooks/useProjects";
import Layout from "../components/Layout";
import ProjectCard from "../components/projects/ProjectCard";
import CreateProjectDialog from "../components/projects/CreateProjectDialog";
import { Loader2 } from "lucide-react";

export default function ProjectsPage() {
  const { data: projects, isLoading, error } = useProjects();

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-gray-500 mt-1">
              Manage your research projects and interview videos
            </p>
          </div>
          <CreateProjectDialog />
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">
              Failed to load projects. Please try again.
            </p>
          </div>
        )}

        {/* Projects Grid */}
        {projects && projects.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">
              No projects yet. Create your first project to get started!
            </p>
          </div>
        )}

        {projects && projects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
