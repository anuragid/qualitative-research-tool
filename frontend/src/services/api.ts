import * as Sentry from "@sentry/react";
import axios from "axios";
import type { ZodType, ZodError } from "zod";

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

/**
 * Thrown when an API response fails schema validation at the client
 * boundary. Caller sites (react-query hooks, ad-hoc fetches) should
 * treat this identically to a 5xx — render a Something Went Wrong
 * state, don't crash the render tree.
 *
 * The Sentry event is fired *inside* `validateResponse` before this
 * error is thrown, so callers don't need to re-capture it. See
 * `docs/production-readiness/prs/pr21-frontend-defensive.md`.
 */
export class SchemaValidationError extends Error {
  url: string;
  zodError: ZodError;

  constructor(url: string, zodError: ZodError) {
    super(`Unexpected response shape from ${url}`);
    this.name = "SchemaValidationError";
    this.url = url;
    this.zodError = zodError;
  }
}

/**
 * Parse an API response through a zod schema. On failure, reports to
 * Sentry with the raw payload and the zod error tree, then throws a
 * {@link SchemaValidationError}.
 *
 * Use this at every API service call site where the response is
 * consumed by React components. The codebase uses axios so we wrap
 * after the `.get/.post` instead of fetch-first — the pattern is:
 *
 * ```ts
 * const response = await api.get(url);
 * return validateResponse(url, response.data, SomeSchema);
 * ```
 *
 * The extra `url` parameter is what Sentry groups on, so keep it
 * stable (don't interpolate ids that produce millions of unique URLs
 * unless you're ok with the cardinality).
 */
export function validateResponse<T>(
  url: string,
  raw: unknown,
  schema: ZodType<T>,
): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    Sentry.captureException(
      new Error(`Schema validation failed: ${url}`),
      {
        tags: { category: "schema_validation", url },
        extra: {
          url,
          // Truncate the raw payload to keep Sentry events under the
          // 100KB limit — full shape is rarely needed, first ~2KB is.
          rawResponse: truncateForSentry(raw),
          zodIssues: parsed.error.issues,
        },
      },
    );
    throw new SchemaValidationError(url, parsed.error);
  }
  return parsed.data;
}

function truncateForSentry(value: unknown, maxBytes = 2048): unknown {
  try {
    const json = JSON.stringify(value);
    if (json.length <= maxBytes) return value;
    return { __truncated: true, preview: json.slice(0, maxBytes) };
  } catch {
    return { __unserializable: true };
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

// Guard against multiple 401 redirects racing
let isRedirecting = false;

// Request interceptor — inject auth token
const DEV_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === "true";

// Validate API URL at startup
if (!import.meta.env.VITE_API_URL && !DEV_BYPASS) {
  Sentry.captureMessage("VITE_API_URL is not set — API calls will use relative paths", "warning");
}

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
      Sentry.addBreadcrumb({
        category: "auth",
        message: "Auth token unavailable, proceeding without auth",
        level: "debug",
        data: { error: error instanceof Error ? error.message : String(error) },
      });
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
        if (!DEV_BYPASS && !isRedirecting && !window.location.pathname.startsWith("/sign-")) {
          isRedirecting = true;
          window.location.href = "/sign-in";
          return new Promise(() => {});
        }
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
