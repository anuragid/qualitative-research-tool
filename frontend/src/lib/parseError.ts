/** Structured error info returned by parseErrorMessage. */
export interface ParsedError {
  step?: string;
  errorType?: "rate_limit" | "timeout" | "llm_error" | "network" | "validation" | "unknown";
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

export function getErrorTypeLabel(errorType?: ParsedError["errorType"]): string {
  switch (errorType) {
    case "rate_limit": return "Rate Limited";
    case "timeout": return "Timed Out";
    case "llm_error": return "LLM Error";
    case "network": return "Network Error";
    case "validation": return "Validation Error";
    default: return "Error";
  }
}
