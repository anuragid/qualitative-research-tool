import { describe, it, expect } from "vitest";
import { parseErrorMessage, getErrorTypeLabel } from "./parseError";

describe("parseErrorMessage", () => {
  // --- Falsy / empty inputs ---

  it("returns null for null input", () => {
    expect(parseErrorMessage(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseErrorMessage(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseErrorMessage("")).toBeNull();
  });

  // --- Valid JSON error objects ---

  it("parses valid JSON with step, error_type, retryable, and message", () => {
    const raw = JSON.stringify({
      step: "chunk",
      error_type: "llm_error",
      retryable: true,
      message: "LLM request failed",
    });

    const result = parseErrorMessage(raw);
    expect(result).toEqual({
      step: "chunk",
      errorType: "llm_error",
      message: "LLM request failed",
      retryable: true,
    });
  });

  it("parses JSON with current_step field (alternative key)", () => {
    const raw = JSON.stringify({
      current_step: "infer",
      error_type: "timeout",
      message: "Request timed out",
      retryable: true,
    });

    const result = parseErrorMessage(raw);
    expect(result).toEqual({
      step: "infer",
      errorType: "timeout",
      message: "Request timed out",
      retryable: true,
    });
  });

  it("parses JSON with errorType field (camelCase alternative)", () => {
    const raw = JSON.stringify({
      errorType: "network",
      message: "Connection lost",
    });

    const result = parseErrorMessage(raw);
    expect(result).toEqual({
      step: undefined,
      errorType: "network",
      message: "Connection lost",
      retryable: true, // Default when retryable is not set
    });
  });

  it("uses detail field when message is absent", () => {
    const raw = JSON.stringify({
      error_type: "validation",
      detail: "Invalid input",
      retryable: false,
    });

    const result = parseErrorMessage(raw);
    expect(result).toEqual({
      step: undefined,
      errorType: "validation",
      message: "Invalid input",
      retryable: false,
    });
  });

  it("uses error field when message and detail are absent", () => {
    const raw = JSON.stringify({
      error_type: "unknown",
      error: "Something went wrong",
    });

    const result = parseErrorMessage(raw);
    expect(result).toEqual({
      step: undefined,
      errorType: "unknown",
      message: "Something went wrong",
      retryable: true,
    });
  });

  it("falls back to raw string when no message/detail/error in JSON", () => {
    const raw = JSON.stringify({ error_type: "llm_error" });

    const result = parseErrorMessage(raw);
    expect(result).not.toBeNull();
    expect(result!.message).toBe(raw);
    expect(result!.errorType).toBe("llm_error");
  });

  it("defaults retryable to true when field is missing", () => {
    const raw = JSON.stringify({ message: "Some error" });

    const result = parseErrorMessage(raw);
    expect(result!.retryable).toBe(true);
  });

  it("respects retryable: false explicitly", () => {
    const raw = JSON.stringify({
      message: "Validation failed",
      retryable: false,
    });

    const result = parseErrorMessage(raw);
    expect(result!.retryable).toBe(false);
  });

  it("defaults error_type to unknown when missing from JSON", () => {
    const raw = JSON.stringify({ message: "Some error" });

    const result = parseErrorMessage(raw);
    expect(result!.errorType).toBe("unknown");
  });

  it("does not treat JSON primitive strings as objects", () => {
    // JSON.parse('"hello"') returns a string, not an object
    const raw = '"hello"';

    const result = parseErrorMessage(raw);
    // Falls through to string classification since parsed is a string, not object
    expect(result).not.toBeNull();
    expect(result!.message).toBe(raw);
    expect(result!.errorType).toBe("unknown");
  });

  // --- Plain string error classification ---

  it('classifies "rate limit" as rate_limit', () => {
    const result = parseErrorMessage("Rate limit exceeded");
    expect(result).toEqual({
      message: "Rate limit exceeded",
      errorType: "rate_limit",
      retryable: true,
    });
  });

  it('classifies "429" as rate_limit', () => {
    const result = parseErrorMessage("Received 429 Too Many Requests");
    expect(result).toEqual({
      message: "Received 429 Too Many Requests",
      errorType: "rate_limit",
      retryable: true,
    });
  });

  it('classifies "rate_limit" as rate_limit', () => {
    const result = parseErrorMessage("Error: rate_limit reached for model");
    expect(result).toEqual({
      message: "Error: rate_limit reached for model",
      errorType: "rate_limit",
      retryable: true,
    });
  });

  it('classifies "timeout" as timeout', () => {
    const result = parseErrorMessage("Request timeout after 30s");
    expect(result).toEqual({
      message: "Request timeout after 30s",
      errorType: "timeout",
      retryable: true,
    });
  });

  it('classifies "timed out" as timeout', () => {
    const result = parseErrorMessage("The operation timed out");
    expect(result).toEqual({
      message: "The operation timed out",
      errorType: "timeout",
      retryable: true,
    });
  });

  it('classifies "network" as network', () => {
    const result = parseErrorMessage("Network error occurred");
    expect(result).toEqual({
      message: "Network error occurred",
      errorType: "network",
      retryable: true,
    });
  });

  it('classifies "connection" as network', () => {
    const result = parseErrorMessage("Connection refused");
    expect(result).toEqual({
      message: "Connection refused",
      errorType: "network",
      retryable: true,
    });
  });

  it("classifies unrecognized string as unknown and retryable", () => {
    const result = parseErrorMessage("Something unexpected happened");
    expect(result).toEqual({
      message: "Something unexpected happened",
      errorType: "unknown",
      retryable: true,
    });
  });

  it("classification is case-insensitive", () => {
    const result = parseErrorMessage("RATE LIMIT exceeded");
    expect(result!.errorType).toBe("rate_limit");
  });
});

describe("parseErrorMessage — backend error_type contract", () => {
  // These tests lock in the backend <-> frontend error_type string contract.
  // They must stay aligned with backend/app/utils/error_classification.py.

  it("preserves llm_permanent error_type from backend JSON", () => {
    const raw = JSON.stringify({
      step: "chunk",
      error_type: "llm_permanent",
      message: "APIStatusError: Error code: 401 - Unauthorized",
      retryable: false,
    });
    const result = parseErrorMessage(raw);
    expect(result).toEqual({
      step: "chunk",
      errorType: "llm_permanent",
      message: "APIStatusError: Error code: 401 - Unauthorized",
      retryable: false,
    });
  });

  it("preserves insufficient_credits error_type from backend JSON", () => {
    const raw = JSON.stringify({
      step: "chunk",
      error_type: "insufficient_credits",
      message: "APIStatusError: Error code: 402 - Insufficient credits",
      retryable: false,
    });
    const result = parseErrorMessage(raw);
    expect(result).toEqual({
      step: "chunk",
      errorType: "insufficient_credits",
      message: "APIStatusError: Error code: 402 - Insufficient credits",
      retryable: false,
    });
  });

  it("insufficient_credits from mid-pipeline (infer step) round-trips", () => {
    const raw = JSON.stringify({
      step: "infer",
      error_type: "insufficient_credits",
      message: "Your OpenRouter account ran out of credits",
      retryable: false,
    });
    const result = parseErrorMessage(raw);
    expect(result!.errorType).toBe("insufficient_credits");
    expect(result!.step).toBe("infer");
    expect(result!.retryable).toBe(false);
  });
});

describe("getErrorTypeLabel", () => {
  it("returns 'Rate Limited' for rate_limit", () => {
    expect(getErrorTypeLabel("rate_limit")).toBe("Rate Limited");
  });

  it("returns 'Timed Out' for timeout", () => {
    expect(getErrorTypeLabel("timeout")).toBe("Timed Out");
  });

  it("returns 'LLM Error' for llm_error", () => {
    expect(getErrorTypeLabel("llm_error")).toBe("LLM Error");
  });

  it("returns 'LLM Error' for llm_permanent", () => {
    expect(getErrorTypeLabel("llm_permanent")).toBe("LLM Error");
  });

  it("returns 'Insufficient Credits' for insufficient_credits", () => {
    expect(getErrorTypeLabel("insufficient_credits")).toBe("Insufficient Credits");
  });

  it("returns 'Network Error' for network", () => {
    expect(getErrorTypeLabel("network")).toBe("Network Error");
  });

  it("returns 'Validation Error' for validation", () => {
    expect(getErrorTypeLabel("validation")).toBe("Validation Error");
  });

  it("returns 'Error' for unknown", () => {
    expect(getErrorTypeLabel("unknown")).toBe("Error");
  });

  it("returns 'Error' for undefined", () => {
    expect(getErrorTypeLabel(undefined)).toBe("Error");
  });
});
