import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsService } from "../services/projects";
import type { CreateProjectDto, UpdateProjectDto } from "../types";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: projectsService.getAll,
    refetchInterval: (query) => {
      const projects = query.state.data;
      // Poll if any project is in processing state
      if (projects?.some((p) => p.status === "processing")) {
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
      const project = query.state.data;
      // Poll while project is processing
      if (project?.status === "processing") {
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
