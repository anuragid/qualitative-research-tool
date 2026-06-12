import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsService } from "../services/projects";
import type { CreateProjectDto, UpdateProjectDto } from "../types";
import { useBackoffInterval } from "./useBackoffInterval";

export function useProjects() {
  const getInterval = useBackoffInterval({
    initialMs: 4000,
    maxMs: 20000,
    growEvery: 6,
  });
  return useQuery({
    queryKey: ["projects"],
    queryFn: projectsService.getAll,
    refetchInterval: (query) => {
      const projects = query.state.data;
      // Poll if any project or its videos are actively processing
      const hasActiveWork = Array.isArray(projects) && !!projects.some(
        (p) =>
          p.status === "processing" ||
          p.videos?.some(
            (v) => v.status === "transcribing" || v.status === "analyzing"
          )
      );
      return getInterval(hasActiveWork);
    },
  });
}

export function useProject(id: string | null) {
  const getInterval = useBackoffInterval({
    initialMs: 3000,
    maxMs: 15000,
    growEvery: 6,
  });
  return useQuery({
    queryKey: ["projects", id],
    queryFn: () => projectsService.getById(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const project = query.state.data;
      // Poll while project or any of its videos are actively processing
      const hasActiveWork =
        project?.status === "processing" ||
        !!project?.videos?.some(
          (v) => v.status === "transcribing" || v.status === "analyzing"
        );
      return getInterval(!!hasActiveWork);
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
