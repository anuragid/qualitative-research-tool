import axios from "axios";

export class ApiError extends Error {
  status: number;
  data?: unknown;
  silent?: boolean;

  constructor(status: number, message: string, data?: unknown, silent?: boolean) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.silent = silent;
  }
}

declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: () => Promise<string | null>;
      };
    };
  }
}

// Create axios instance with base configuration
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000, // 30 seconds
});

// Request interceptor — inject auth token
const DEV_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === "true";

api.interceptors.request.use(
  async (config) => {
    try {
      if (DEV_BYPASS) {
        // Dev mode: use backend's dev-bypass token → dev_user_local
        config.headers.Authorization = "Bearer dev-bypass";
      } else {
        const token = await window.Clerk?.session?.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    } catch (error) {
      console.debug("Auth token unavailable, proceeding without auth:", error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle common errors
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      const url = error.config?.url || '';

      if (status === 401) {
        // Unauthorized -- token may be expired
      } else if (status === 404) {
        // Don't log 404s for analysis endpoints - these are expected when no analysis exists
        const isAnalysisEndpoint = url.includes('/analysis') ||
                                   url.includes('/transcript/words') ||
                                   url.includes('/meta-patterns') ||
                                   url.includes('/cross-insights') ||
                                   url.includes('/system-principles');
        if (!isAnalysisEndpoint) {
          // 404 for non-analysis endpoints
        }
        // Silently handle 404s for analysis endpoints
        if (isAnalysisEndpoint) {
          return Promise.reject(new ApiError(404, "Analysis not found", data, true));
        }
      } else if (status === 500) {
        // Server error
      }

      // Return error with more context
      return Promise.reject(new ApiError(status, data?.detail || data?.message || "An error occurred", data));
    } else if (error.request) {
      // Request made but no response
      return Promise.reject(new ApiError(0, "No response from server. Please check your connection."));
    } else {
      // Something else happened
      return Promise.reject(new ApiError(-1, error.message || "An unexpected error occurred"));
    }
  }
);

export default api;
