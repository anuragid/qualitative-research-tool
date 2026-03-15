import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";

// We need to test the interceptors that api.ts registers.
// Since interceptors are registered at module load time, we test
// them by importing the configured api instance and inspecting the
// interceptor handlers directly, then invoking them.

describe("api module", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("axios instance configuration", () => {
    it("creates an axios instance with correct defaults", async () => {
      const { api } = await import("./api");
      expect(api.defaults.headers["Content-Type"]).toBe("application/json");
      expect(api.defaults.timeout).toBe(30000);
    });

    it("exports api as both named and default export", async () => {
      const module = await import("./api");
      expect(module.api).toBeDefined();
      expect(module.default).toBeDefined();
      expect(module.api).toBe(module.default);
    });
  });

  describe("request interceptor", () => {
    it("attaches Bearer token when Clerk session is available", async () => {
      const mockGetToken = vi.fn().mockResolvedValue("test-token-123");
      window.Clerk = {
        session: {
          getToken: mockGetToken,
        },
      };

      const { api } = await import("./api");
      // Access the request interceptor fulfilled handler
      // Interceptors are stored in the manager; we can invoke them via a request
      const config: InternalAxiosRequestConfig = {
        headers: new axios.AxiosHeaders(),
        url: "/test",
      };

      // Get the interceptor handlers from the manager
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestInterceptors = (api.interceptors.request as any).handlers;
      const interceptor = requestInterceptors[requestInterceptors.length - 1];
      const result = await interceptor.fulfilled(config);

      expect(result.headers.Authorization).toBe("Bearer test-token-123");
      expect(mockGetToken).toHaveBeenCalled();

      delete window.Clerk;
    });

    it("does not set Authorization header when token is null", async () => {
      const mockGetToken = vi.fn().mockResolvedValue(null);
      window.Clerk = {
        session: {
          getToken: mockGetToken,
        },
      };

      const { api } = await import("./api");
      const config: InternalAxiosRequestConfig = {
        headers: new axios.AxiosHeaders(),
        url: "/test",
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestInterceptors = (api.interceptors.request as any).handlers;
      const interceptor = requestInterceptors[requestInterceptors.length - 1];
      const result = await interceptor.fulfilled(config);

      expect(result.headers.Authorization).toBeUndefined();

      delete window.Clerk;
    });

    it("does not set Authorization header when Clerk is not available", async () => {
      delete window.Clerk;

      const { api } = await import("./api");
      const config: InternalAxiosRequestConfig = {
        headers: new axios.AxiosHeaders(),
        url: "/test",
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestInterceptors = (api.interceptors.request as any).handlers;
      const interceptor = requestInterceptors[requestInterceptors.length - 1];
      const result = await interceptor.fulfilled(config);

      expect(result.headers.Authorization).toBeUndefined();
    });

    it("proceeds without auth when getToken throws an error", async () => {
      window.Clerk = {
        session: {
          getToken: vi.fn().mockRejectedValue(new Error("Clerk error")),
        },
      };

      const { api } = await import("./api");
      const config: InternalAxiosRequestConfig = {
        headers: new axios.AxiosHeaders(),
        url: "/test",
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestInterceptors = (api.interceptors.request as any).handlers;
      const interceptor = requestInterceptors[requestInterceptors.length - 1];
      const result = await interceptor.fulfilled(config);

      // Should still return config without throwing
      expect(result).toBe(config);
      expect(result.headers.Authorization).toBeUndefined();

      delete window.Clerk;
    });

    it("rejects with error on request interceptor error handler", async () => {
      const { api } = await import("./api");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestInterceptors = (api.interceptors.request as any).handlers;
      const interceptor = requestInterceptors[requestInterceptors.length - 1];

      const error = new Error("request setup error");
      await expect(interceptor.rejected(error)).rejects.toBe(error);
    });
  });

  describe("response interceptor", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let responseInterceptor: any;

    beforeEach(async () => {
      const { api } = await import("./api");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseInterceptors = (api.interceptors.response as any).handlers;
      responseInterceptor = responseInterceptors[responseInterceptors.length - 1];
    });

    it("passes through successful responses", () => {
      const response = { data: { id: 1 }, status: 200 };
      const result = responseInterceptor.fulfilled(response);
      expect(result).toBe(response);
    });

    describe("error handling with server response (error.response)", () => {
      it("rejects with status and message for 401 errors", async () => {
        const error = {
          response: {
            status: 401,
            data: { detail: "Unauthorized" },
          },
          config: { url: "/api/projects/" },
        };

        await expect(responseInterceptor.rejected(error)).rejects.toEqual({
          status: 401,
          message: "Unauthorized",
          data: { detail: "Unauthorized" },
        });
      });

      it("rejects with status and message for 500 errors", async () => {
        const error = {
          response: {
            status: 500,
            data: { detail: "Internal Server Error" },
          },
          config: { url: "/api/projects/" },
        };

        await expect(responseInterceptor.rejected(error)).rejects.toEqual({
          status: 500,
          message: "Internal Server Error",
          data: { detail: "Internal Server Error" },
        });
      });

      it("uses data.message when data.detail is not available", async () => {
        const error = {
          response: {
            status: 400,
            data: { message: "Bad Request" },
          },
          config: { url: "/api/test" },
        };

        await expect(responseInterceptor.rejected(error)).rejects.toEqual({
          status: 400,
          message: "Bad Request",
          data: { message: "Bad Request" },
        });
      });

      it("uses fallback message when neither detail nor message is available", async () => {
        const error = {
          response: {
            status: 400,
            data: {},
          },
          config: { url: "/api/test" },
        };

        await expect(responseInterceptor.rejected(error)).rejects.toEqual({
          status: 400,
          message: "An error occurred",
          data: {},
        });
      });

      it("handles missing config.url gracefully", async () => {
        const error = {
          response: {
            status: 404,
            data: { detail: "Not found" },
          },
          config: undefined,
        };

        // With no config, url will be '' (from error.config?.url || '')
        await expect(responseInterceptor.rejected(error)).rejects.toEqual({
          status: 404,
          message: "Not found",
          data: { detail: "Not found" },
        });
      });

      describe("404 handling for analysis endpoints", () => {
        const analysisUrls = [
          "/api/videos/123/analysis",
          "/api/videos/123/transcript/words",
          "/api/projects/456/meta-patterns",
          "/api/projects/456/cross-insights",
          "/api/projects/456/system-principles",
        ];

        for (const url of analysisUrls) {
          it(`returns silent rejection for analysis endpoint: ${url}`, async () => {
            const error = {
              response: {
                status: 404,
                data: { detail: "Not found" },
              },
              config: { url },
            };

            await expect(responseInterceptor.rejected(error)).rejects.toEqual({
              status: 404,
              message: "Analysis not found",
              data: { detail: "Not found" },
              silent: true,
            });
          });
        }
      });

      it("returns standard rejection for 404 on non-analysis endpoints", async () => {
        const error = {
          response: {
            status: 404,
            data: { detail: "Project not found" },
          },
          config: { url: "/api/projects/123/" },
        };

        await expect(responseInterceptor.rejected(error)).rejects.toEqual({
          status: 404,
          message: "Project not found",
          data: { detail: "Project not found" },
        });
      });
    });

    describe("error handling with no response (error.request)", () => {
      it("rejects with network error message when request was made but no response", async () => {
        const error = {
          request: new XMLHttpRequest(),
        };

        await expect(responseInterceptor.rejected(error)).rejects.toEqual({
          status: 0,
          message: "No response from server. Please check your connection.",
        });
      });
    });

    describe("error handling with no request and no response", () => {
      it("rejects with the error message when available", async () => {
        const error = {
          message: "Network Error",
        };

        await expect(responseInterceptor.rejected(error)).rejects.toEqual({
          status: -1,
          message: "Network Error",
        });
      });

      it("rejects with fallback message when error.message is not available", async () => {
        const error = {};

        await expect(responseInterceptor.rejected(error)).rejects.toEqual({
          status: -1,
          message: "An unexpected error occurred",
        });
      });
    });
  });
});
