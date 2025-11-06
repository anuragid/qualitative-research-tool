import { Link } from "react-router-dom";
import { formatDate } from "../../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Badge } from "../ui/Badge";
import type { Project } from "../../types";
import { Video, Calendar } from "lucide-react";

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const videoCount = project.videos?.length || 0;

  return (
    <Link to={`/projects/${project.id}`}>
      <Card className="transition-all hover:shadow-lg cursor-pointer">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg">{project.name}</CardTitle>
            <Badge variant={project.status === "active" ? "default" : "secondary"}>
              {project.status}
            </Badge>
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
    </Link>
  );
}
