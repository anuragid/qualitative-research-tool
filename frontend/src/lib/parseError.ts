/** Canonical error type strings emitted by the backend.
 *
 * Must stay in sync with `backend/app/utils/error_classification.py`
 * (ERROR_TYPE_* constants).
 */
export type ErrorType =
  | "rate_limit"
  | "timeout"
  | "llm_error"
  | "llm_permanent"         // permanent 4xx other than 402 (400, 401, 403, 422)
  | "insufficient_credits"  // 402 — user's OpenRouter key has no credits, show "Add credits" CTA
  | "network"
  | "validation"
  | "unknown";

/** Structured error info returned by parseErrorMessage. */
export interface ParsedError {
  step?: string;
  errorType?: ErrorType;
  message: string;
  retryable: boolean;
}

/**
 * Attempt to parse a raw error string (potentially JSON) into structured info.
 *
 * Returns `null` for falsy inputs (null, undefined, empty string).
 */
export function parseErrorMessage(raw: string | null | undefined): ParsedError | null {
  if (!raw) return null;

  // Try parsing as JSON first
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return {
        step: parsed.step || parsed.current_step || undefined,
        errorType: parsed.error_type || parsed.errorType || "unknown",
        message: parsed.message || parsed.detail || parsed.error || raw,
        retryable: parsed.retryable !== false, // Default to retryable
      };
    }
  } catch {
    // Not JSON, fall through
  }

  // Classify plain string errors
  const lower = raw.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("rate_limit")) {
    return { message: raw, errorType: "rate_limit", retryable: true };
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { message: raw, errorType: "timeout", retryable: true };
  }
  if (lower.includes("network") || lower.includes("connection")) {
    return { message: raw, errorType: "network", retryable: true };
  }

  return { message: raw, errorType: "unknown", retryable: true };
}

/**
 * Unwrap an unknown thrown error (typically an Axios rejection) into a
 * displayable string. Reads `response.data.detail` first (FastAPI shape),
 * then `message`, then falls back.
 *
 * Use this in mutation/query error UI rendering instead of hand-rolling
 * the type narrowing each time.
 */
export function extractErrorDetail(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null) {
    const e = err as {
      response?: { data?: { detail?: unknown } };
      message?: string;
    };
    const detail = e.response?.data?.detail;
    if (typeof detail === "string") return detail;
    // FastAPI sometimes returns a structured detail object — surface its
    // `message` field if present.
    if (typeof detail === "object" && detail !== null && "message" in detail) {
      const msg = (detail as { message?: unknown }).message;
      if (typeof msg === "string") return msg;
    }
    if (typeof e.message === "string") return e.message;
  }
  return fallback;
}

export function getErrorTypeLabel(errorType?: ParsedError["errorType"]): string {
  switch (errorType) {
    case "rate_limit": return "Rate Limited";
    case "timeout": return "Timed Out";
    case "llm_error": return "LLM Error";
    case "llm_permanent": return "LLM Error";
    case "insufficient_credits": return "Insufficient Credits";
    case "network": return "Network Error";
    case "validation": return "Validation Error";
    default: return "Error";
  }
}
