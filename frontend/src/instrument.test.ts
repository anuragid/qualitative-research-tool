import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the Sentry beforeSend filter in instrument.ts.
 *
 * We test the filter logic directly rather than importing instrument.ts
 * (which calls Sentry.init as a side effect).
 */

// Extract the beforeSend logic into a testable function matching instrument.ts
function beforeSend(event: {
  exception?: { values?: Array<{ value?: string }> };
}) {
  const message = event.exception?.values?.[0]?.value ?? "";
  if (message.includes("ClerkJS") && message.includes("Network error")) {
    return null;
  }
  return event;
}

describe("Sentry beforeSend filter", () => {
  it("drops ClerkJS network errors from session touch", () => {
    const event = {
      exception: {
        values: [
          {
            value:
              'ClerkJS: Network error at "https://methodex.ai/__clerk/v1/client/sessions/sess_abc/touch" - TypeError: Failed to fetch',
          },
        ],
      },
    };
    expect(beforeSend(event)).toBeNull();
  });

  it("drops ClerkJS network errors with Load failed variant", () => {
    const event = {
      exception: {
        values: [
          {
            value:
              'ClerkJS: Network error at "https://methodex.ai/__clerk/v1/client/sessions/sess_xyz/touch" - TypeError: Load failed',
          },
        ],
      },
    };
    expect(beforeSend(event)).toBeNull();
  });

  it("passes through non-Clerk errors", () => {
    const event = {
      exception: {
        values: [
          {
            value: "TypeError: Cannot read properties of undefined",
          },
        ],
      },
    };
    expect(beforeSend(event)).toBe(event);
  });

  it("passes through events without exceptions", () => {
    const event = {};
    expect(beforeSend(event)).toBe(event);
  });

  it("passes through ClerkJS errors that are not network errors", () => {
    const event = {
      exception: {
        values: [
          {
            value: "ClerkJS: Invalid publishable key",
          },
        ],
      },
    };
    expect(beforeSend(event)).toBe(event);
  });
});
