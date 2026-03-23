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
    // NOTE: When VITE_DEV_AUTH_BYPASS=true (set in dev/test environments),
    // the interceptor always sets "Bearer dev-bypass" regardless of Clerk state.
    // These tests account for that behavior.

    it("sets Authorization header via dev bypass or Clerk token", async () => {
      const { api } = await import("./api");
      const config: InternalAxiosRequestConfig = {
        headers: new axios.AxiosHeaders(),
        url: "/test",
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestInterceptors = (api.interceptors.request as any).handlers;
      const interceptor = requestInterceptors[requestInterceptors.length - 1];
      const result = await interceptor.fulfilled(config);

      // In dev/test environment, it uses dev-bypass; in production it would use Clerk
      expect(result.headers.Authorization).toBeDefined();
      // Verify it's a Bearer token
      expect(String(result.headers.Authorization)).toMatch(/^Bearer /);
    });

    it("always returns a valid config from the interceptor", async () => {
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

      // Should return config object regardless
      expect(result).toBe(config);
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
      it("handles 401 errors — halts further processing via redirect on non-sign-in pages", async () => {
        const error = {
          response: {
            status: 401,
            data: { detail: "Unauthorized" },
          },
          config: { url: "/api/projects/" },
        };

        // The 401 handler redirects to /sign-in and returns a never-resolving promise
        // when not already on a sign-in page. We test the sign-in page path
        // where it falls through to normal rejection.
        Object.defineProperty(window, "location", {
          value: { pathname: "/sign-in", href: window.location.href },
          writable: true,
          configurable: true,
        });

        await expect(responseInterceptor.rejected(error)).rejects.toMatchObject({
          status: 401,
          message: "Unauthorized",
          data: { detail: "Unauthorized" },
        });

        // Restore
        Object.defineProperty(window, "location", {
          value: { pathname: "/", href: window.location.href },
          writable: true,
          configurable: true,
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

        await expect(responseInterceptor.rejected(error)).rejects.toMatchObject({
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

        await expect(responseInterceptor.rejected(error)).rejects.toMatchObject({
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

        await expect(responseInterceptor.rejected(error)).rejects.toMatchObject({
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
        await expect(responseInterceptor.rejected(error)).rejects.toMatchObject({
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

            await expect(responseInterceptor.rejected(error)).rejects.toMatchObject({
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

        await expect(responseInterceptor.rejected(error)).rejects.toMatchObject({
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

        await expect(responseInterceptor.rejected(error)).rejects.toMatchObject({
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

        await expect(responseInterceptor.rejected(error)).rejects.toMatchObject({
          status: -1,
          message: "Network Error",
        });
      });

      it("rejects with fallback message when error.message is not available", async () => {
        const error = {};

        await expect(responseInterceptor.rejected(error)).rejects.toMatchObject({
          status: -1,
          message: "An unexpected error occurred",
        });
      });
    });

    describe("500 error propagation", () => {
      it("propagates 500 errors with status and detail", async () => {
        const error = {
          response: {
            status: 500,
            data: { detail: "Internal Server Error" },
          },
          config: { url: "/api/videos/123" },
        };

        await expect(responseInterceptor.rejected(error)).rejects.toMatchObject({
          status: 500,
          message: "Internal Server Error",
        });
      });

      it("propagates 503 errors", async () => {
        const error = {
          response: {
            status: 503,
            data: { detail: "Service Unavailable" },
          },
          config: { url: "/api/videos/123" },
        };

        await expect(responseInterceptor.rejected(error)).rejects.toMatchObject({
          status: 503,
          message: "Service Unavailable",
        });
      });
    });

    describe("network errors are wrapped in ApiError", () => {
      it("wraps network errors (no response) with status 0", async () => {
        const error = { request: new XMLHttpRequest() };

        const rejection = responseInterceptor.rejected(error);
        await expect(rejection).rejects.toMatchObject({
          status: 0,
          message: "No response from server. Please check your connection.",
        });
        await expect(rejection).rejects.toBeInstanceOf(Error);
      });

      it("wraps unexpected errors with status -1", async () => {
        const error = { message: "Unexpected" };

        const rejection = responseInterceptor.rejected(error);
        await expect(rejection).rejects.toMatchObject({
          status: -1,
          message: "Unexpected",
        });
        await expect(rejection).rejects.toBeInstanceOf(Error);
      });
    });
  });
});
