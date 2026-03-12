import axios from "axios";

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
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000, // 30 seconds
});

// Request interceptor — inject Clerk auth token
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await window.Clerk?.session?.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.log("No auth token available");
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
        // Handle unauthorized
        console.error("Unauthorized access");
      } else if (status === 404) {
        // Don't log 404s for analysis endpoints - these are expected when no analysis exists
        const isAnalysisEndpoint = url.includes('/analysis') ||
                                   url.includes('/transcript/words') ||
                                   url.includes('/meta-patterns') ||
                                   url.includes('/cross-insights') ||
                                   url.includes('/system-principles');
        if (!isAnalysisEndpoint) {
          console.error("Resource not found");
        }
        // Silently handle 404s for analysis endpoints
        if (isAnalysisEndpoint) {
          return Promise.reject({
            status: 404,
            message: "Analysis not found",
            data,
            silent: true
          });
        }
      } else if (status === 500) {
        console.error("Server error");
      }

      // Return error with more context
      return Promise.reject({
        status,
        message: data.detail || data.message || "An error occurred",
        data,
      });
    } else if (error.request) {
      // Request made but no response
      return Promise.reject({
        status: 0,
        message: "No response from server. Please check your connection.",
      });
    } else {
      // Something else happened
      return Promise.reject({
        status: -1,
        message: error.message || "An unexpected error occurred",
      });
    }
  }
);

export default api;
