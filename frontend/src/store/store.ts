import { create } from "zustand";

interface AppState {
  // Current project being viewed
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;

  // Current video being viewed
  currentVideoId: string | null;
  setCurrentVideoId: (id: string | null) => void;

  // Upload progress tracking
  uploadProgress: Record<string, number>;
  setUploadProgress: (fileId: string, progress: number) => void;
  clearUploadProgress: (fileId: string) => void;

  // UI state
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentProjectId: null,
  setCurrentProjectId: (id) => set({ currentProjectId: id }),

  currentVideoId: null,
  setCurrentVideoId: (id) => set({ currentVideoId: id }),

  uploadProgress: {},
  setUploadProgress: (fileId, progress) =>
    set((state) => ({
      uploadProgress: { ...state.uploadProgress, [fileId]: progress },
    })),
  clearUploadProgress: (fileId) =>
    set((state) => {
      const { [fileId]: _, ...rest } = state.uploadProgress;
      return { uploadProgress: rest };
    }),

  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}));
