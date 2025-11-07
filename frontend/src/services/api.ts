import axios from "axios";

// Create axios instance with base configuration
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000, // 30 seconds
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // You can add auth tokens here in the future
    // const token = localStorage.getItem('token');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
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
