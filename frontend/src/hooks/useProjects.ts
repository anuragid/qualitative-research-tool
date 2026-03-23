import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsService } from "../services/projects";
import type { CreateProjectDto, UpdateProjectDto } from "../types";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: projectsService.getAll,
    refetchInterval: (query) => {
      if (document.hidden) return false;
      const projects = query.state.data;
      // Poll if any project or its videos are actively processing
      const hasActiveWork = projects?.some(
        (p) =>
          p.status === "processing" ||
          p.videos?.some(
            (v) => v.status === "transcribing" || v.status === "analyzing"
          )
      );
      if (hasActiveWork) {
        return 3000; // Poll every 3 seconds
      }
      return false;
    },
  });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: ["projects", id],
    queryFn: () => projectsService.getById(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      if (document.hidden) return false;
      const project = query.state.data;
      // Poll while project or any of its videos are actively processing
      const hasActiveWork =
        project?.status === "processing" ||
        project?.videos?.some(
          (v) => v.status === "transcribing" || v.status === "analyzing"
        );
      if (hasActiveWork) {
        return 3000; // Poll every 3 seconds
      }
      return false;
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProjectDto) => projectsService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectDto }) =>
      projectsService.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects", variables.id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => projectsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
